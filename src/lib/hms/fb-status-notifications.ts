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

/**
 * Last snapshot each (slug, area) pair has seen — in-memory only, one tab's
 * lifetime. There is nothing to persist: once a notification has been shown
 * as a toast it never needs to be reconstructed, so there is no
 * "pending"/"acknowledged" state to keep around across reloads or tabs.
 */
const lastSeenByKey = new Map<string, Map<string, OrderSnap>>();

function snapshotKey(slug: string, area: FbNotifyArea) {
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

  // A ticket leaving the board because it was paid/closed needs no action
  // from the kitchen — only surface it when the order was voided, since that
  // means "stop working on this" if it's still being prepped.
  for (const [orderId, before] of prev) {
    if (next.has(orderId)) continue;
    if (before.status !== "voided") continue;
    events.push({
      id: `${orderId}:removed:${before.status}`,
      orderId,
      orderNumber: before.order_number,
      message: `#${before.order_number}: Order cancelled`,
      at,
    });
  }

  return events;
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

/**
 * Compares the given orders against what this (slug, area) pair last saw in
 * this tab and returns any new, non-self-caused events. The baseline always
 * advances to the current state — there is no "acknowledge" step; a caller
 * that doesn't act on the result simply won't see the same event again.
 */
export function checkForFbNotifications(
  slug: string,
  area: FbNotifyArea,
  orders: FbOrderWithItems[],
): FbStatusNotification[] {
  const key = snapshotKey(slug, area);
  const next = buildSnapshot(orders);
  const prev = lastSeenByKey.get(key);
  lastSeenByKey.set(key, next);

  // First check in this tab for this area — nothing to diff against yet, and
  // we don't want to replay a backlog of "new" events for state that already
  // existed before this tab opened.
  if (!prev) return [];

  const events = area === "restaurant" ? diffRestaurantEvents(prev, next) : diffKitchenEvents(prev, next);
  const isSelfNoise = area === "restaurant" ? isRestaurantSelfNoise : isKitchenSelfNoise;
  return events.filter((event) => !isSelfNoise(event));
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
