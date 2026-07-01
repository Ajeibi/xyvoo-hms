import type { FbKitchenStatus, FbOrderStatus, FbOrderWithItems } from "@/lib/hms/fb-types";

export type FbNotifyArea = "restaurant" | "kitchen";

export type FbStatusNotification = {
  id: string;
  orderId: string;
  orderNumber: string;
  message: string;
  at: string;
};

type ItemSnap = { name: string; kitchen_status: FbKitchenStatus };
type OrderSnap = {
  order_number: string;
  status: FbOrderStatus;
  rush: boolean;
  items: Record<string, ItemSnap>;
};

const NOTIFY_AREAS: FbNotifyArea[] = ["restaurant", "kitchen"];
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

function formatOrderStatus(status: FbOrderStatus) {
  const labels: Record<FbOrderStatus, string> = {
    open: "open",
    sent_to_kitchen: "sent to kitchen",
    ready: "ready for service",
    closed: "closed",
    voided: "cancelled",
  };
  return labels[status];
}

function formatKitchenStatus(status: FbKitchenStatus) {
  const labels: Record<FbKitchenStatus, string> = {
    pending: "pending",
    preparing: "preparing",
    ready: "ready",
    served: "served",
    voided: "cancelled",
  };
  return labels[status];
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

function diffSnapshots(prev: Map<string, OrderSnap>, next: Map<string, OrderSnap>) {
  const events: FbStatusNotification[] = [];
  const at = new Date().toISOString();

  for (const [orderId, order] of next) {
    const before = prev.get(orderId);
    if (!before) {
      events.push({
        id: `${orderId}:created:${order.status}`,
        orderId,
        orderNumber: order.order_number,
        message:
          order.status === "sent_to_kitchen"
            ? `New order #${order.order_number} sent to kitchen`
            : `New order #${order.order_number} (${formatOrderStatus(order.status)})`,
        at,
      });
      continue;
    }

    if (before.status !== order.status) {
      events.push({
        id: `${orderId}:status:${order.status}`,
        orderId,
        orderNumber: order.order_number,
        message: `#${order.order_number}: Order ${formatOrderStatus(order.status)}`,
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
      } else if (prevItem.kitchen_status !== item.kitchen_status) {
        events.push({
          id: `${orderId}:item:${itemId}:${item.kitchen_status}`,
          orderId,
          orderNumber: order.order_number,
          message: `#${order.order_number}: ${item.name} is ${formatKitchenStatus(item.kitchen_status)}`,
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

/** Compare live orders to each area's last-acknowledged snapshot. */
export function ingestFbOrderSnapshot(slug: string, orders: FbOrderWithItems[]) {
  const next = buildSnapshot(orders);
  orderSnapshots.set(slug, next);

  for (const area of NOTIFY_AREAS) {
    const acked = readAckedSnapshot(slug, area) ?? new Map<string, OrderSnap>();
    const events = diffSnapshots(acked, next);
    appendPendingForArea(slug, area, events);
  }
}

export function getFbPendingNotifications(slug: string, area: FbNotifyArea) {
  return readPending(slug, area);
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
