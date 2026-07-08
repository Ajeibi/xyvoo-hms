import type { MetricTileItem, StatusRowItem } from "@/components/hms/dashboard/analytics/shared";
import {
  hasOpenKitchenItems,
  isKitchenWorkComplete,
  isOrderFullyServed,
  isOrderKitchenOverdue,
  kitchenTimeMinutes,
  resolveOverdueMinutes,
} from "@/lib/hms/fb-order-timing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

export type DashboardFbOrderRow = {
  id: string;
  outlet_id: string;
  status: string;
  settlement_method: string | null;
  subtotal: string | number;
  closed_at: string | null;
  sent_to_kitchen_at: string | null;
  kitchen_ready_at: string | null;
  created_at: string;
  voided_at: string | null;
};

export type DashboardFbOutletRow = {
  id: string;
  name: string;
  outlet_type: "restaurant" | "bar" | "room_service";
};

export type DashboardFbItemRow = {
  order_id: string;
  kitchen_status: string;
};

function parseTs(value: string) {
  return new Date(value).getTime();
}

function utcDayRangeIso(reference = new Date()) {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const next = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), nextIso: next.toISOString() };
}

function inUtcDay(value: string, reference = new Date()) {
  const t = parseTs(value);
  const { startIso, nextIso } = utcDayRangeIso(reference);
  return t >= parseTs(startIso) && t < parseTs(nextIso);
}

function num(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function isPosSettlement(method: string | null) {
  return method === "pos" || method === "cash" || method === "card";
}

/** Counter / PoS collections from closed F&B tickets today (not on guest folios). */
export function fbPosRevenueForUtcDay(orders: DashboardFbOrderRow[], reference = new Date()) {
  let total = 0;
  for (const order of orders) {
    if (order.status !== "closed" || !order.closed_at) continue;
    if (!inUtcDay(order.closed_at, reference)) continue;
    if (!isPosSettlement(order.settlement_method)) continue;
    total += num(order.subtotal);
  }
  return Math.round(total * 100) / 100;
}

/** All closed F&B revenue today (PoS + room charge), for the F&B dashboard card. */
export function fbClosedRevenueForUtcDay(orders: DashboardFbOrderRow[], reference = new Date()) {
  let total = 0;
  for (const order of orders) {
    if (order.status !== "closed" || !order.closed_at) continue;
    if (!inUtcDay(order.closed_at, reference)) continue;
    const method = order.settlement_method;
    if (method !== "room_charge" && !isPosSettlement(method)) continue;
    total += num(order.subtotal);
  }
  return Math.round(total * 100) / 100;
}

export type DashboardFbSections = {
  hasLiveFbData: boolean;
  fbPosRevenueToday: number;
  foodAndBeverageItems: MetricTileItem[];
  outletBreakdownItems: StatusRowItem[];
  kitchenItems: MetricTileItem[];
  kitchenAlertItems: StatusRowItem[];
};

export function buildDashboardFbSections(params: {
  orders: DashboardFbOrderRow[];
  outlets: DashboardFbOutletRow[];
  items: DashboardFbItemRow[];
  currency: string;
  kitchenOverdueMinutes: number;
  reference?: Date;
}): DashboardFbSections {
  const { orders, outlets, items, currency, kitchenOverdueMinutes, reference = new Date() } = params;
  const hasLiveFbData = orders.length > 0;

  const itemsByOrder = new Map<string, { kitchen_status: string }[]>();
  for (const row of items) {
    const list = itemsByOrder.get(row.order_id) ?? [];
    list.push({ kitchen_status: row.kitchen_status });
    itemsByOrder.set(row.order_id, list);
  }

  const outletById = new Map(outlets.map((o) => [o.id, o]));
  const fbRevenueToday = fbClosedRevenueForUtcDay(orders, reference);
  const fbPosRevenueToday = fbPosRevenueForUtcDay(orders, reference);

  const closedToday = orders.filter(
    (o) => o.status === "closed" && o.closed_at && inUtcDay(o.closed_at, reference),
  );
  const ordersToday = closedToday.length;
  const chargeToRoomToday = closedToday
    .filter((o) => o.settlement_method === "room_charge")
    .reduce((sum, o) => sum + num(o.subtotal), 0);
  const averageBill =
    ordersToday > 0 ? Math.round(fbRevenueToday / ordersToday) : 0;

  const outletTotals = new Map<string, number>();
  for (const order of closedToday) {
    const outlet = outletById.get(order.outlet_id);
    const key = outlet?.outlet_type ?? "restaurant";
    outletTotals.set(key, (outletTotals.get(key) ?? 0) + num(order.subtotal));
  }

  const outletLabel: Record<string, string> = {
    restaurant: "Restaurant",
    bar: "Bar",
    room_service: "Room service",
  };

  const foodAndBeverageItems: MetricTileItem[] = [
    {
      label: "F&B revenue",
      value: formatPricingAmount(fbRevenueToday, currency),
      description:
        ordersToday > 0
          ? `${ordersToday} closed ticket(s) today (UTC).`
          : "No F&B tickets closed today yet.",
    },
    {
      label: "Orders today",
      value: String(ordersToday),
      description: "Closed restaurant, bar, and room-service tickets.",
    },
    {
      label: "Average bill",
      value: formatPricingAmount(averageBill, currency),
      description: "Mean subtotal per closed ticket today.",
    },
    {
      label: "Charge to room",
      value: formatPricingAmount(chargeToRoomToday, currency),
      description: "Posted to in-house guest folios today.",
    },
  ];

  const outletBreakdownItems: StatusRowItem[] = (["restaurant", "bar", "room_service"] as const).map(
    (type) => {
      const value = outletTotals.get(type) ?? 0;
      const names = outlets.filter((o) => o.outlet_type === type).map((o) => o.name);
      return {
        title: outletLabel[type],
        detail:
          value > 0
            ? `${names.join(", ") || outletLabel[type]} sales today.`
            : `No ${outletLabel[type].toLowerCase()} tickets closed today.`,
        value: formatPricingAmount(value, currency),
        tone: value > 0 ? ("info" as const) : ("info" as const),
      };
    },
  );

  const now = reference.getTime();
  const threshold = resolveOverdueMinutes(kitchenOverdueMinutes);
  let openTickets = 0;
  let delayedOrders = 0;
  let readyForService = 0;
  const prepSamples: number[] = [];

  for (const order of orders) {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    if (order.status === "voided" || order.status === "closed") {
      if (
        order.status === "closed" &&
        order.kitchen_ready_at &&
        order.sent_to_kitchen_at &&
        inUtcDay(order.kitchen_ready_at, reference)
      ) {
        const mins = kitchenTimeMinutes({
          sent_to_kitchen_at: order.sent_to_kitchen_at,
          created_at: order.created_at,
          closed_at: order.kitchen_ready_at,
        });
        if (mins !== null) prepSamples.push(mins);
      }
      continue;
    }

    if (order.status === "sent_to_kitchen" || order.status === "ready" || order.status === "open") {
      if (order.sent_to_kitchen_at && hasOpenKitchenItems(orderItems)) {
        openTickets += 1;
        if (
          isOrderKitchenOverdue(
            order.sent_to_kitchen_at,
            order.created_at,
            now,
            true,
            threshold,
          )
        ) {
          delayedOrders += 1;
        }
      }
      if (
        order.status === "ready" &&
        isKitchenWorkComplete(orderItems) &&
        !isOrderFullyServed(orderItems)
      ) {
        readyForService += 1;
      }
    }
  }

  const avgPrep =
    prepSamples.length > 0
      ? `${Math.round(prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length)}m`
      : "—";

  const kitchenItems: MetricTileItem[] = [
    {
      label: "Open tickets",
      value: String(openTickets),
      description: "Tickets still on the kitchen line.",
    },
    {
      label: "Average prep time",
      value: avgPrep,
      description: "Mean cook time for tickets finished today.",
    },
    {
      label: "Delayed orders",
      value: String(delayedOrders),
      description: `Over ${threshold} min on the live board.`,
    },
    {
      label: "Ready for service",
      value: String(readyForService),
      description: "Kitchen done — awaiting F&B pickup.",
    },
  ];

  const kitchenAlertItems: StatusRowItem[] = [];
  if (delayedOrders > 0) {
    kitchenAlertItems.push({
      title: "Kitchen delays",
      detail: `${delayedOrders} live ticket(s) exceeded the ${threshold} minute target.`,
      tone: "warning",
    });
  }
  if (readyForService > 0) {
    kitchenAlertItems.push({
      title: "Ready to run",
      detail: `${readyForService} ticket(s) waiting for F&B service.`,
      tone: "info",
    });
  }
  if (kitchenAlertItems.length === 0) {
    kitchenAlertItems.push({
      title: openTickets > 0 ? "Kitchen active" : "Kitchen clear",
      detail:
        openTickets > 0
          ? `${openTickets} ticket(s) in progress on the live board.`
          : "No open kitchen tickets right now.",
      tone: "info",
    });
  }

  return {
    hasLiveFbData,
    fbPosRevenueToday,
    foodAndBeverageItems,
    outletBreakdownItems,
    kitchenItems,
    kitchenAlertItems,
  };
}
