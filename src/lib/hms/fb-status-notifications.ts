import type { FbKitchenStatus, FbOrderStatus, FbOrderWithItems } from "@/lib/hms/fb-types";

export type FbNotifyArea = "restaurant" | "kitchen";

export type FbNotificationTone = "positive" | "default";

export type FbStatusNotification = {
  id: string;
  orderId: string;
  orderNumber: string;
  message: string;
  at: string;
  tone?: FbNotificationTone;
};

type ItemSnap = { name: string; kitchen_status: FbKitchenStatus };
type OrderSnap = {
  order_number: string;
  status: FbOrderStatus;
  rush: boolean;
  items: Record<string, ItemSnap>;
};

const orderSnapshots = new Map<string, Map<string, OrderSnap>>();
const pendingListeners = new Map<string, Set<() => void>>();

function pendingKey(slug: string, area: FbNotifyArea) {
  return `fb-status-notifs:${slug}:${area}`;
}

function ackedKey(slug: string, area: FbNotifyArea) {
  return `fb-status-acked:${slug}:${area}`;
}

function listenerKey(slug: string, area: FbNotifyArea) {
  return `${slug}:${area}`;
}

function buildSnapshot(orders: FbOrderWithItems[]) {
  const snap = new Map<string, OrderSnap>();
  for (const order of orders) {
    const items: Record<string, ItemSnap> = {};
    for (const item of order.items) {
      items[item.id] = {
        name: item.name_snapshot,
        kitchen_status: item.kitchen_status,
      };
    }
    snap.set(order.id, {
      order_number: order.order_number,
      status: order.status,
      rush: order.rush,
      items,
    });
  }
  return snap;
}

function cloneSnapshot(snap: Map<string, OrderSnap>) {
  const next = new Map<string, OrderSnap>();
  for (const [id, order] of snap) {
    next.set(id, {
      ...order,
      items: { ...order.items },
    });
  }
  return next;
}

function serializeSnapshot(snap: Map<string, OrderSnap>) {
  return JSON.stringify([...snap.entries()]);
}

function deserializeSnapshot(raw: string | null): Map<string, OrderSnap> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as [string, OrderSnap][];
    if (!Array.isArray(parsed)) return null;
    return new Map(parsed);
  } catch {
    return null;
  }
}

function readAckedSnapshot(slug: string, area: FbNotifyArea) {
  if (typeof sessionStorage === "undefined") return null;
  return deserializeSnapshot(sessionStorage.getItem(ackedKey(slug, area)));
}

function writeAckedSnapshot(slug: string, area: FbNotifyArea, snap: Map<string, OrderSnap>) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(ackedKey(slug, area), serializeSnapshot(snap));
}

/** Kitchen → F&B: ready for pickup / service. */
function diffRestaurantEvents(prev: Map<string, OrderSnap>, next: Map<string, OrderSnap>) {
  const events: FbStatusNotification[] = [];
  const at = new Date().toISOString();

  for (const [orderId, order] of next) {
    const before = prev.get(orderId);
    if (!before) continue;

    const orderBecameReady = before.status !== "ready" && order.status === "ready";
    if (orderBecameReady) {
      events.push({
        id: `${orderId}:status:ready`,
        orderId,
        orderNumber: order.order_number,
        message: `Order #${order.order_number} is ready for service`,
        at,
        tone: "positive",
      });
    }

    for (const [itemId, item] of Object.entries(order.items)) {
      const prevItem = before.items[itemId];
      if (!prevItem || prevItem.kitchen_status === item.kitchen_status) continue;
      if (item.kitchen_status !== "ready") continue;
      if (orderBecameReady) continue;

      events.push({
        id: `${orderId}:item:${itemId}:ready`,
        orderId,
        orderNumber: order.order_number,
        message: `#${order.order_number}: ${item.name} is ready`,
        at,
        tone: "positive",
      });
    }
  }

  return events;
}

/** F&B → Kitchen: new work, rush, cancellations. */
function diffKitchenEvents(prev: Map<string, OrderSnap>, next: Map<string, OrderSnap>) {
  const events: FbStatusNotification[] = [];
  const at = new Date().toISOString();

  for (const [orderId, order] of next) {
    const before = prev.get(orderId);
    if (!before) {
      if (order.status === "sent_to_kitchen") {
        events.push({
          id: `${orderId}:created:sent_to_kitchen`,
          orderId,
          orderNumber: order.order_number,
          message: `New order #${order.order_number} sent to kitchen`,
          at,
        });
      }
      continue;
    }

    if (before.status !== order.status && order.status === "sent_to_kitchen") {
      events.push({
        id: `${orderId}:status:sent_to_kitchen`,
        orderId,
        orderNumber: order.order_number,
        message: `#${order.order_number}: Order sent to kitchen`,
        at,
      });
    }

    if (!before.rush && order.rush) {
      events.push({
        id: `${orderId}:rush`,
        orderId,
        orderNumber: order.order_number,
        message: `#${order.order_number}: Marked as RUSH`,
        at,
      });
    }

    for (const [itemId, item] of Object.entries(order.items)) {
      const prevItem = before.items[itemId];
      if (!prevItem) {
        events.push({
          id: `${orderId}:item:${itemId}:added`,
          orderId,
          orderNumber: order.order_number,
          message: `#${order.order_number}: ${item.name} added`,
          at,
        });
      }
    }
  }

  for (const [orderId, before] of prev) {
    if (next.has(orderId)) continue;
    const terminal = before.status === "voided" ? "cancelled" : "closed";
    events.push({
      id: `${orderId}:removed:${before.status}`,
      orderId,
      orderNumber: before.order_number,
      message: `#${before.order_number}: Order ${terminal}`,
      at,
    });
  }

  return events;
}

function readPending(slug: string, area: FbNotifyArea): FbStatusNotification[] {
  if (typeof sessionStorage === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(pendingKey(slug, area));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FbStatusNotification[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePending(slug: string, area: FbNotifyArea, list: FbStatusNotification[]) {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(pendingKey(slug, area), JSON.stringify(list));
  const key = listenerKey(slug, area);
  for (const cb of pendingListeners.get(key) ?? []) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

function appendPendingForArea(slug: string, area: FbNotifyArea, events: FbStatusNotification[]) {
  if (!events.length) return;
  const existing = readPending(slug, area);
  const seen = new Set(existing.map((e) => e.id));
  const merged = [...existing];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    merged.push(event);
  }
  writePending(slug, area, merged);
}

function syncAckedOrderFromNext(
  acked: Map<string, OrderSnap>,
  next: Map<string, OrderSnap>,
  orderId: string,
) {
  const order = next.get(orderId);
  if (order) {
    acked.set(orderId, {
      ...order,
      items: { ...order.items },
    });
    return;
  }
  acked.delete(orderId);
}

function isRestaurantSelfNoise(event: FbStatusNotification) {
  if (event.id.endsWith(":served")) return true;
  if (/:item:[^:]+:served$/.test(event.id)) return true;
  if (/served to guest/i.test(event.message)) return true;
  if (event.id.includes(":status:sent_to_kitchen") || event.id.includes(":created:sent_to_kitchen")) {
    return true;
  }
  if (/:item:[^:]+:added$/.test(event.id) && !event.tone) return true;
  if (event.id.includes(":removed:")) return true;
  return false;
}

function isKitchenSelfNoise(event: FbStatusNotification) {
  if (event.id.includes(":status:ready") || event.id.includes(":created:ready")) return true;
  if (/:item:[^:]+:ready$/.test(event.id)) return true;
  if (/:item:[^:]+:served$/.test(event.id)) return true;
  if (event.id.endsWith(":served")) return true;
  return /ready for service/i.test(event.message) || /\bis ready$/i.test(event.message);
}

function absorbKitchenReadyState(
  slug: string,
  acked: Map<string, OrderSnap>,
  next: Map<string, OrderSnap>,
) {
  const updated = cloneSnapshot(acked);
  for (const [orderId, order] of next) {
    const before = updated.get(orderId);
    if (!before) {
      if (order.status === "ready") {
        syncAckedOrderFromNext(updated, next, orderId);
      }
      continue;
    }
    if (before.status !== "ready" && order.status === "ready") {
      syncAckedOrderFromNext(updated, next, orderId);
      continue;
    }
    const itemBecameReady = Object.entries(order.items).some(([itemId, item]) => {
      const prevItem = before.items[itemId];
      return prevItem && prevItem.kitchen_status !== "ready" && item.kitchen_status === "ready";
    });
    if (itemBecameReady) {
      syncAckedOrderFromNext(updated, next, orderId);
    }
  }
  writeAckedSnapshot(slug, "kitchen", updated);
}

function absorbRestaurantSelfState(
  slug: string,
  acked: Map<string, OrderSnap>,
  next: Map<string, OrderSnap>,
) {
  const updated = cloneSnapshot(acked);
  for (const [orderId, order] of next) {
    const active = Object.values(order.items).filter((i) => i.kitchen_status !== "voided");
    const allServed = active.length > 0 && active.every((i) => i.kitchen_status === "served");
    if (allServed) {
      syncAckedOrderFromNext(updated, next, orderId);
    }
  }
  writeAckedSnapshot(slug, "restaurant", updated);
}

/** Compare live orders to each area's last-acknowledged snapshot. */
export function ingestFbOrderSnapshot(slug: string, orders: FbOrderWithItems[]) {
  const next = buildSnapshot(orders);
  orderSnapshots.set(slug, next);

  const restaurantAcked = readAckedSnapshot(slug, "restaurant") ?? new Map<string, OrderSnap>();
  const kitchenAcked = readAckedSnapshot(slug, "kitchen") ?? new Map<string, OrderSnap>();

  appendPendingForArea(slug, "restaurant", diffRestaurantEvents(restaurantAcked, next));
  appendPendingForArea(slug, "kitchen", diffKitchenEvents(kitchenAcked, next));

  absorbRestaurantSelfState(slug, restaurantAcked, next);
  absorbKitchenReadyState(slug, kitchenAcked, next);

  writePending(
    slug,
    "restaurant",
    readPending(slug, "restaurant").filter((e) => !isRestaurantSelfNoise(e)),
  );
  writePending(
    slug,
    "kitchen",
    readPending(slug, "kitchen").filter((e) => !isKitchenSelfNoise(e)),
  );
}

export function getFbPendingNotifications(slug: string, area: FbNotifyArea) {
  return readPending(slug, area);
}

export function isReadyServiceNotification(note: FbStatusNotification) {
  if (note.id.includes(":status:ready") || note.id.includes(":created:ready")) return true;
  if (/:item:[^:]+:ready$/.test(note.id)) return true;
  return /ready for service/i.test(note.message) || /\bis ready$/i.test(note.message);
}

export function readyServiceOrderIds(notes: FbStatusNotification[]) {
  const ids = new Set<string>();
  for (const note of notes) {
    if (isReadyServiceNotification(note)) ids.add(note.orderId);
  }
  return [...ids];
}

export function notificationTone(note: FbStatusNotification): FbNotificationTone {
  if (note.tone === "positive" || isReadyServiceNotification(note)) return "positive";
  return "default";
}

export function acknowledgeFbNotification(slug: string, area: FbNotifyArea, id: string) {
  const current = readPending(slug, area);
  const target = current.find((n) => n.id === id);
  writePending(
    slug,
    area,
    current.filter((n) => n.id !== id),
  );

  if (!target) return;
  const next = orderSnapshots.get(slug);
  if (!next) return;

  const acked = readAckedSnapshot(slug, area) ?? new Map<string, OrderSnap>();
  syncAckedOrderFromNext(acked, next, target.orderId);
  writeAckedSnapshot(slug, area, acked);
}

export function acknowledgeAllFbNotifications(slug: string, area: FbNotifyArea) {
  const current = orderSnapshots.get(slug);
  if (current) writeAckedSnapshot(slug, area, cloneSnapshot(current));
  writePending(slug, area, []);
}

export function subscribeFbPendingNotifications(
  slug: string,
  area: FbNotifyArea,
  listener: () => void,
) {
  const key = listenerKey(slug, area);
  const set = pendingListeners.get(key) ?? new Set();
  set.add(listener);
  pendingListeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) pendingListeners.delete(key);
  };
}
