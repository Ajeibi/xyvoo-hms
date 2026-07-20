import type { DashboardPeriod } from "@/components/hms/dashboard/analytics/dashboard-analytics-types";
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

const PERIOD_DAYS: Record<DashboardPeriod, number> = { day: 1, week: 7, month: 30 };

export const PERIOD_NOUN: Record<DashboardPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
};

/** Rolling window ending at the start of the next UTC day (e.g. "week" = last 7 calendar days). */
function utcPeriodRangeIso(period: DashboardPeriod, reference = new Date()) {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const start = new Date(Date.UTC(y, m, d - (PERIOD_DAYS[period] - 1), 0, 0, 0, 0));
  const next = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), nextIso: next.toISOString() };
}

function inUtcPeriod(value: string, period: DashboardPeriod, reference = new Date()) {
  const t = parseTs(value);
  const { startIso, nextIso } = utcPeriodRangeIso(period, reference);
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
  period?: DashboardPeriod;
  reference?: Date;
}): DashboardFbSections {
  const {
    orders,
    outlets,
    items,
    currency,
    kitchenOverdueMinutes,
    period = "day",
    reference = new Date(),
  } = params;
  const hasLiveFbData = orders.length > 0;
  const periodNoun = PERIOD_NOUN[period];

  const itemsByOrder = new Map<string, { kitchen_status: string }[]>();
  for (const row of items) {
    const list = itemsByOrder.get(row.order_id) ?? [];
    list.push({ kitchen_status: row.kitchen_status });
    itemsByOrder.set(row.order_id, list);
  }

  const outletById = new Map(outlets.map((o) => [o.id, o]));
  const fbPosRevenueToday = fbPosRevenueForUtcDay(orders, reference);

  const closedInPeriod = orders.filter(
    (o) => o.status === "closed" && o.closed_at && inUtcPeriod(o.closed_at, period, reference),
  );
  const fbRevenueInPeriod =
    Math.round(
      closedInPeriod
        .filter((o) => o.settlement_method === "room_charge" || isPosSettlement(o.settlement_method))
        .reduce((sum, o) => sum + num(o.subtotal), 0) * 100,
    ) / 100;
  const ordersInPeriod = closedInPeriod.length;
  const chargeToRoomInPeriod = closedInPeriod
    .filter((o) => o.settlement_method === "room_charge")
    .reduce((sum, o) => sum + num(o.subtotal), 0);
  const averageBill =
    ordersInPeriod > 0 ? Math.round(fbRevenueInPeriod / ordersInPeriod) : 0;

  const outletTotals = new Map<string, number>();
  for (const order of closedInPeriod) {
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
      value: formatPricingAmount(fbRevenueInPeriod, currency),
      description:
        ordersInPeriod > 0
          ? `${ordersInPeriod} closed ticket(s) ${periodNoun} (UTC).`
          : `No F&B tickets closed ${periodNoun} yet.`,
    },
    {
      label: "Orders",
      value: String(ordersInPeriod),
      description: `Closed restaurant, bar, and room-service tickets ${periodNoun}.`,
    },
    {
      label: "Average bill",
      value: formatPricingAmount(averageBill, currency),
      description: `Mean subtotal per closed ticket ${periodNoun}.`,
    },
    {
      label: "Charge to room",
      value: formatPricingAmount(chargeToRoomInPeriod, currency),
      description: `Posted to in-house guest folios ${periodNoun}.`,
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
            ? `${names.join(", ") || outletLabel[type]} sales ${periodNoun}.`
            : `No ${outletLabel[type].toLowerCase()} tickets closed ${periodNoun}.`,
        value: formatPricingAmount(value, currency),
        tone: value > 0 ? ("info" as const) : ("info" as const),
      };
    },
  );

  const now = reference.getTime();
  const threshold = resolveOverdueMinutes(kitchenOverdueMinutes);
  let openTickets = 0;
  let liveDelayedOrders = 0;
  let readyForService = 0;
  const prepSamplesInPeriod: number[] = [];
  let completedInPeriod = 0;
  let delayedInPeriod = 0;

  for (const order of orders) {
    const orderItems = itemsByOrder.get(order.id) ?? [];
    if (order.status === "voided" || order.status === "closed") {
      if (
        order.status === "closed" &&
        order.kitchen_ready_at &&
        order.sent_to_kitchen_at &&
        inUtcPeriod(order.kitchen_ready_at, period, reference)
      ) {
        const mins = kitchenTimeMinutes({
          sent_to_kitchen_at: order.sent_to_kitchen_at,
          created_at: order.created_at,
          closed_at: order.kitchen_ready_at,
        });
        if (mins !== null) {
          prepSamplesInPeriod.push(mins);
          completedInPeriod += 1;
          if (mins > threshold) delayedInPeriod += 1;
        }
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
          liveDelayedOrders += 1;
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
    prepSamplesInPeriod.length > 0
      ? `${Math.round(prepSamplesInPeriod.reduce((a, b) => a + b, 0) / prepSamplesInPeriod.length)}m`
      : "—";

  const kitchenItems: MetricTileItem[] = [
    {
      label: "Open tickets",
      value: String(openTickets),
      description: "Tickets on the kitchen line right now (live, not affected by the period filter).",
    },
    {
      label: "Average prep time",
      value: avgPrep,
      description: `Mean cook time for tickets finished ${periodNoun}.`,
    },
    {
      label: "Delayed orders",
      value: String(period === "day" ? liveDelayedOrders : delayedInPeriod),
      description:
        period === "day"
          ? `Over ${threshold} min on the live board right now.`
          : `${delayedInPeriod} of ${completedInPeriod} ticket(s) finished ${periodNoun} took over ${threshold} min.`,
    },
    {
      label: "Ready for service",
      value: String(readyForService),
      description: "Kitchen done — awaiting F&B pickup (live, not affected by the period filter).",
    },
  ];

  const kitchenAlertItems: StatusRowItem[] = [];
  if (liveDelayedOrders > 0) {
    kitchenAlertItems.push({
      title: "Kitchen delays",
      detail: `${liveDelayedOrders} live ticket(s) exceeded the ${threshold} minute target.`,
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
