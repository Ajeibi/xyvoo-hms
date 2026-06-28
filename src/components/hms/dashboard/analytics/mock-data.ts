import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { MetricTileItem, StatusRowItem, SummaryTileItem } from "./shared";

export type FinancePeriod = "day" | "week" | "month" | "quarter";
export type FinanceMetric = "revenue" | "occupancy" | "adr" | "revpar" | "expenses" | "profit";

export type FloorStatusItem = {
  label: string;
  value: number;
  color: string;
  colorClass: string;
};

export type RoomStatusItem = {
  label: string;
  value: number;
};

export type OccupancyTrend = {
  labels: string[];
  values: number[];
};

export type FinancialBase = {
  grossRevenueToday: number;
  effectiveAverageRate: number;
  occupancyRate: number;
};

export type DashboardAnalyticsModel = {
  financialBase: FinancialBase;
  movementItems: MetricTileItem[];
  roomStatusItems: RoomStatusItem[];
  floorStatusItems: FloorStatusItem[];
  occupancyTrend: OccupancyTrend;
  foodAndBeverageItems: MetricTileItem[];
  outletBreakdownItems: StatusRowItem[];
  kitchenItems: MetricTileItem[];
  kitchenAlertItems: StatusRowItem[];
  inventorySummary: SummaryTileItem[];
  lowStockItems: StatusRowItem[];
  operationalAlerts: StatusRowItem[];
};

function buildScaledSeries(baseValue: number, factors: number[]) {
  return factors.map((factor) => Math.round(baseValue * factor));
}

function buildRevParSeries(adrSeries: number[], occupancySeries: number[], occupancyRate: number) {
  return adrSeries.map((rate, index) =>
    Math.round((rate * (occupancySeries[index] ?? occupancySeries[0] ?? occupancyRate)) / 100),
  );
}

function buildProfitSeries(revenueSeries: number[], expenseSeries: number[]) {
  return revenueSeries.map((revenue, index) => Math.max(revenue - (expenseSeries[index] ?? 0), 0));
}

export function buildFinancialTrendViews(financialBase: FinancialBase): Record<
  FinancePeriod,
  {
    labels: string[];
    unitLabel: string;
    summary: string;
    metrics: Record<FinanceMetric, number[]>;
  }
> {
  const { grossRevenueToday, effectiveAverageRate, occupancyRate } = financialBase;

  return {
    day: {
      labels: ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"],
      unitLabel: "hour block",
      summary: "Intraday commercial pulse across rooms, cashier desks, and ancillary outlets.",
      metrics: {
        revenue: buildScaledSeries(grossRevenueToday, [0.08, 0.11, 0.15, 0.18, 0.22, 0.19]),
        occupancy: [42, 48, 56, 61, 67, 58],
        adr: buildScaledSeries(effectiveAverageRate, [0.92, 0.95, 0.98, 1.03, 1.06, 1.01]),
        revpar: buildRevParSeries(
          buildScaledSeries(effectiveAverageRate, [0.92, 0.95, 0.98, 1.03, 1.06, 1.01]),
          [42, 48, 56, 61, 67, 58],
          occupancyRate,
        ),
        expenses: buildScaledSeries(grossRevenueToday, [0.031, 0.038, 0.052, 0.061, 0.07, 0.058]),
        profit: buildProfitSeries(
          buildScaledSeries(grossRevenueToday, [0.08, 0.11, 0.15, 0.18, 0.22, 0.19]),
          buildScaledSeries(grossRevenueToday, [0.031, 0.038, 0.052, 0.061, 0.07, 0.058]),
        ),
      },
    },
    week: {
      labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      unitLabel: "day",
      summary: "Seven-day commercial movement across room sales, collections, and operating costs.",
      metrics: {
        revenue: buildScaledSeries(grossRevenueToday, [0.88, 0.94, 0.91, 1.02, 1.08, 1.16, 0.98]),
        occupancy: [56, 61, 58, 66, 64, 69, 72],
        adr: buildScaledSeries(effectiveAverageRate, [0.97, 1.0, 0.98, 1.05, 1.03, 1.08, 1.02]),
        revpar: buildRevParSeries(
          buildScaledSeries(effectiveAverageRate, [0.97, 1.0, 0.98, 1.05, 1.03, 1.08, 1.02]),
          [56, 61, 58, 66, 64, 69, 72],
          occupancyRate,
        ),
        expenses: buildScaledSeries(grossRevenueToday, [0.36, 0.38, 0.37, 0.41, 0.42, 0.46, 0.39]),
        profit: buildProfitSeries(
          buildScaledSeries(grossRevenueToday, [0.88, 0.94, 0.91, 1.02, 1.08, 1.16, 0.98]),
          buildScaledSeries(grossRevenueToday, [0.36, 0.38, 0.37, 0.41, 0.42, 0.46, 0.39]),
        ),
      },
    },
    month: {
      labels: ["Week 1", "Week 2", "Week 3", "Week 4"],
      unitLabel: "week",
      summary: "Month-to-date trend for commercial output, room performance, and cost pressure.",
      metrics: {
        revenue: buildScaledSeries(grossRevenueToday, [6.1, 5.8, 6.5, 6.9]),
        occupancy: [58, 61, 64, 68],
        adr: buildScaledSeries(effectiveAverageRate, [0.98, 0.96, 1.01, 1.05]),
        revpar: buildRevParSeries(
          buildScaledSeries(effectiveAverageRate, [0.98, 0.96, 1.01, 1.05]),
          [58, 61, 64, 68],
          occupancyRate,
        ),
        expenses: buildScaledSeries(grossRevenueToday, [2.46, 2.38, 2.61, 2.74]),
        profit: buildProfitSeries(
          buildScaledSeries(grossRevenueToday, [6.1, 5.8, 6.5, 6.9]),
          buildScaledSeries(grossRevenueToday, [2.46, 2.38, 2.61, 2.74]),
        ),
      },
    },
    quarter: {
      labels: ["Jan", "Feb", "Mar"],
      unitLabel: "month",
      summary: "Quarter view for executive performance: revenue, room yield, and operating return.",
      metrics: {
        revenue: buildScaledSeries(grossRevenueToday, [24, 27, 29]),
        occupancy: [61, 64, 69],
        adr: buildScaledSeries(effectiveAverageRate, [0.97, 1.01, 1.06]),
        revpar: buildRevParSeries(
          buildScaledSeries(effectiveAverageRate, [0.97, 1.01, 1.06]),
          [61, 64, 69],
          occupancyRate,
        ),
        expenses: buildScaledSeries(grossRevenueToday, [9.4, 10.2, 10.8]),
        profit: buildProfitSeries(
          buildScaledSeries(grossRevenueToday, [24, 27, 29]),
          buildScaledSeries(grossRevenueToday, [9.4, 10.2, 10.8]),
        ),
      },
    },
  };
}

export function buildDashboardAnalyticsModel({
  totalRooms,
  averageRate,
  currency,
}: {
  totalRooms: number;
  averageRate: number | null;
  currency: string;
}): DashboardAnalyticsModel {
  const baseRooms = Math.max(totalRooms, 48);
  const occupiedRooms = Math.max(18, Math.round(baseRooms * 0.54));
  const maintenanceRooms = Math.max(2, Math.round(baseRooms * 0.04));
  const cleaningRooms = Math.max(4, Math.round(baseRooms * 0.1));
  const occupancyRate = baseRooms > 0 ? Math.round((occupiedRooms / baseRooms) * 100) : 0;
  const effectiveAverageRate = averageRate ?? Math.max(18000, Math.round(baseRooms * 520));
  const roomRevenueToday = Math.round(occupiedRooms * effectiveAverageRate * 0.92);
  const ancillaryRevenueToday = Math.round(roomRevenueToday * 0.18);
  const grossRevenueToday = roomRevenueToday + ancillaryRevenueToday;
  const arrivalsToday = Math.max(7, Math.round(baseRooms * 0.14));
  const departuresToday = Math.max(6, Math.round(baseRooms * 0.12));
  const noShowsToday = Math.max(1, Math.round(arrivalsToday * 0.08));
  const cancellationsToday = Math.max(1, Math.round(arrivalsToday * 0.12));
  const stayOversTonight = Math.max(occupiedRooms - departuresToday, 0);
  const pendingCheckIns = Math.max(2, Math.round(arrivalsToday * 0.35));
  const pendingCheckOuts = Math.max(2, Math.round(departuresToday * 0.4));
  const unsettledFolios = Math.max(3, Math.round(occupiedRooms * 0.22));
  const lowStockCount = 3;
  const pendingPurchaseOrders = 2;
  const fnbRevenueToday = Math.round(grossRevenueToday * 0.27);
  const fnbOrdersToday = Math.max(42, Math.round(baseRooms * 1.1));
  const roomServiceOrders = Math.max(6, Math.round(fnbOrdersToday * 0.16));
  const averageBill = Math.round(fnbRevenueToday / Math.max(fnbOrdersToday, 1));
  const chargeToRoomTotal = Math.round(fnbRevenueToday * 0.31);
  const restaurantSales = Math.round(fnbRevenueToday * 0.56);
  const barSales = Math.round(fnbRevenueToday * 0.29);
  const roomServiceSales = Math.round(fnbRevenueToday * 0.15);
  const coversServed = Math.max(58, Math.round(fnbOrdersToday * 1.45));
  const openKitchenTickets = Math.max(5, Math.round(roomServiceOrders * 0.55));
  const averagePrepTime = 18;
  const delayedKitchenOrders = Math.max(2, Math.round(openKitchenTickets * 0.28));
  const readyForService = Math.max(3, Math.round(openKitchenTickets * 0.42));
  const unavailableItems = 2;
  const kitchenStockAlerts = 3;

  return {
    financialBase: {
      grossRevenueToday,
      effectiveAverageRate,
      occupancyRate,
    },
    // Room / floor housekeeping counts come only from `hotel.room_units` in production.
    // Preview mode (no live schema) must not invent inventory — zeros until the API connects.
    roomStatusItems: [
      { label: "Occupied", value: 0 },
      { label: "Vacant clean", value: 0 },
      { label: "Dirty", value: 0 },
      { label: "Inspected", value: 0 },
    ],
    movementItems: [
      {
        label: "Arrivals today",
        value: String(arrivalsToday),
        description: `${pendingCheckIns} guest(s) are still pending arrival`,
      },
      {
        label: "Departures today",
        value: String(departuresToday),
        description: `${pendingCheckOuts} room(s) are awaiting checkout action`,
      },
      {
        label: "No-shows",
        value: String(noShowsToday),
        description: "Reservations marked absent after cutoff time",
      },
      {
        label: "Cancellations",
        value: String(cancellationsToday),
        description: `${stayOversTonight} stay-over room(s) expected tonight`,
      },
    ],
    occupancyTrend: {
      labels: ["May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
      values: [56, 61, 58, 66, 64, 69, 72, 75],
    },
    floorStatusItems: [
      {
        label: "No live room inventory",
        value: 0,
        color: "rgba(148, 163, 184, 0.78)",
        colorClass: "bg-slate-400",
      },
    ],
    foodAndBeverageItems: [
      {
        label: "F&B revenue",
        value: formatPricingAmount(fnbRevenueToday, currency),
        description: "Restaurant, bar, and room-service sales posted today.",
      },
      {
        label: "Orders today",
        value: String(fnbOrdersToday),
        description: `${roomServiceOrders} room-service order(s) included in the current count.`,
      },
      {
        label: "Average bill",
        value: formatPricingAmount(averageBill, currency),
        description: "Blended average spend per outlet order served today.",
      },
      {
        label: "Charge to room",
        value: formatPricingAmount(chargeToRoomTotal, currency),
        description: "Orders already posted or pending posting into guest folios.",
      },
    ],
    outletBreakdownItems: [
      {
        title: "Restaurant sales",
        detail: `${coversServed} covers served today across dine-in operations.`,
        value: formatPricingAmount(restaurantSales, currency),
        tone: "info",
      },
      {
        title: "Bar sales",
        detail: "Drinks and lounge checks closed across active cashier shifts.",
        value: formatPricingAmount(barSales, currency),
        tone: "warning",
      },
      {
        title: "Room service",
        detail: `${roomServiceOrders} order(s) routed from in-house guests so far.`,
        value: formatPricingAmount(roomServiceSales, currency),
        tone: "critical",
      },
    ],
    kitchenItems: [
      {
        label: "Open tickets",
        value: String(openKitchenTickets),
        description: "Kitchen order tickets still moving through prep stations.",
      },
      {
        label: "Avg prep time",
        value: `${averagePrepTime} min`,
        description: "Average preparation time across active tickets.",
      },
      {
        label: "Delayed orders",
        value: String(delayedKitchenOrders),
        description: "Tickets currently outside the preferred prep SLA.",
      },
      {
        label: "86 items",
        value: String(unavailableItems),
        description: "Menu items temporarily unavailable for ordering.",
      },
    ],
    kitchenAlertItems: [
      {
        title: "Ready for service",
        detail: `${readyForService} order(s) are plated and waiting for pickup or delivery.`,
        tone: "info",
      },
      {
        title: "Kitchen backlog",
        detail: `${delayedKitchenOrders} ticket(s) have passed the prep threshold and need follow-up.`,
        tone: "warning",
      },
      {
        title: "Ingredient alerts",
        detail: `${kitchenStockAlerts} ingredient line(s) are below preferred par level.`,
        tone: "critical",
      },
    ],
    inventorySummary: [
      {
        label: "Low-stock items",
        value: String(lowStockCount),
        caption: "Critical SKUs to review before next dispatch",
      },
      {
        label: "Pending POs",
        value: String(pendingPurchaseOrders),
        caption: "Supplier orders still waiting for delivery",
      },
      {
        label: "Stock value",
        value: formatPricingAmount(Math.round(grossRevenueToday * 3.4), currency),
        caption: "Preview store and housekeeping stock position",
      },
    ],
    lowStockItems: [
      {
        title: "Bath towels",
        detail: "Reorder at 40 pcs",
        value: "24 pcs",
        tone: "warning",
      },
      {
        title: "Mini-bar water",
        detail: "Reorder at 50 bottles",
        value: "36 bottles",
        tone: "info",
      },
      {
        title: "Laundry detergent",
        detail: "Reorder at 5 drums",
        value: "3 drums",
        tone: "critical",
      },
    ],
    operationalAlerts: [
      {
        title: "Out-of-order rooms",
        detail: `${maintenanceRooms} room(s) are blocked and unavailable for sale.`,
        tone: "warning",
      },
      {
        title: "Housekeeping backlog",
        detail: `${cleaningRooms} room(s) still need cleaning before evening allocation.`,
        tone: "info",
      },
      {
        title: "Late checkout requests",
        detail: `${Math.max(2, Math.round(departuresToday * 0.35))} guest(s) requested extended stay time today.`,
        tone: "warning",
      },
      {
        title: "Unsettled folios",
        detail: `${unsettledFolios} in-house folio(s) still need cashier review before close.`,
        tone: "critical",
      },
    ],
  };
}
