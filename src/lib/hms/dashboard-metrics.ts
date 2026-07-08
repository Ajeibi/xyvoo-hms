import type {
  DashboardAnalyticsModel,
  FloorStatusItem,
  OccupancyTrend,
  RoomStatusItem,
} from "@/components/hms/dashboard/analytics/dashboard-analytics-types";
import type { MetricTileItem, StatusRowItem, SummaryTileItem } from "@/components/hms/dashboard/analytics/shared";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  buildDashboardFbSections,
  type DashboardFbItemRow,
  type DashboardFbOrderRow,
  type DashboardFbOutletRow,
} from "@/lib/hms/dashboard-fb-metrics";
import {
  buildFinancialTrendViews,
  computeGrossRevenueForUtcDay,
  emptyFinancialTrendViews,
  getGrossRevenueForUtcDay,
  inUtcDay,
  type FolioRevenueRow,
} from "@/lib/hms/dashboard-revenue-series";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";

export { computeGrossRevenueForUtcDay, getGrossRevenueForUtcDay };

type RoomUnitRow = { id: string; status: string; floor: number };
type ReservationRow = {
  status: string;
  arrival_at: string;
  departure_at: string;
  adults: number;
  children_json: unknown;
  rate_per_night: string | number;
  total_room_charges: string | number;
  checked_in_at: string | null;
  checked_out_at: string | null;
  room_unit_id: string | null;
};

function utcDayRangeIso(reference = new Date()) {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const next = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), nextIso: next.toISOString() };
}

function parseTs(value: string) {
  return new Date(value).getTime();
}

import {
  countInHouseGuestHeadcount,
} from "@/lib/hms/reservation-metrics";

function num(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function monthShortLabel(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
}

function buildOccupancyTrendFromReservations(
  reservations: ReservationRow[],
  totalRooms: number,
  monthsBack = 8,
): OccupancyTrend {
  const now = new Date();
  const labels: string[] = [];
  const values: number[] = [];
  const safeRooms = Math.max(totalRooms, 1);

  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth();
    const start = Date.UTC(y, m, 1, 0, 0, 0, 0);
    const end = Date.UTC(y, m + 1, 1, 0, 0, 0, 0);
    labels.push(monthShortLabel(y, m));

    let roomNights = 0;
    const daysInMonth = Math.round((end - start) / 86400000);
    for (const r of reservations) {
      if (r.status === "cancelled") continue;
      const a = parseTs(r.arrival_at);
      const dep = parseTs(r.departure_at);
      const overlapStart = Math.max(a, start);
      const overlapEnd = Math.min(dep, end);
      if (overlapEnd > overlapStart) {
        const nights = Math.ceil((overlapEnd - overlapStart) / 86400000);
        roomNights += Math.max(nights, 1);
      }
    }
    const capacity = safeRooms * daysInMonth;
    const pct = Math.min(100, Math.round((roomNights / capacity) * 100));
    values.push(pct);
  }

  return { labels, values };
}

function emptyDepartmentPlaceholders(currency: string): Pick<
  DashboardAnalyticsModel,
  | "foodAndBeverageItems"
  | "outletBreakdownItems"
  | "kitchenItems"
  | "kitchenAlertItems"
  | "inventorySummary"
  | "lowStockItems"
> {
  return {
    foodAndBeverageItems: [
      {
        label: "F&B revenue",
        value: formatPricingAmount(0, currency),
        description: "No tickets closed today.",
      },
      {
        label: "Orders today",
        value: "0",
        description: "Closed outlet orders for today (UTC).",
      },
      {
        label: "Average bill",
        value: formatPricingAmount(0, currency),
        description: "Average spend per closed order today.",
      },
      {
        label: "Charge to room",
        value: formatPricingAmount(0, currency),
        description: "Room-charge orders posted to folios today.",
      },
    ],
    outletBreakdownItems: [
      {
        title: "Restaurant",
        detail: "No restaurant tickets closed today.",
        value: formatPricingAmount(0, currency),
        tone: "info",
      },
      {
        title: "Bar",
        detail: "No bar tickets closed today.",
        value: formatPricingAmount(0, currency),
        tone: "info",
      },
      {
        title: "Room service",
        detail: "No room-service tickets closed today.",
        value: formatPricingAmount(0, currency),
        tone: "info",
      },
    ],
    kitchenItems: [
      {
        label: "Open tickets",
        value: "0",
        description: "Kitchen tickets still in prep.",
      },
      {
        label: "Average prep time",
        value: "—",
        description: "Average prep time for tickets closed today.",
      },
      {
        label: "Delayed orders",
        value: "0",
        description: "Tickets past the kitchen SLA today.",
      },
      {
        label: "Ready for service",
        value: "0",
        description: "Tickets marked ready and awaiting pickup.",
      },
    ],
    kitchenAlertItems: [
      {
        title: "Kitchen queue",
        detail: "No kitchen alerts for the current shift.",
        tone: "info",
      },
    ],
    inventorySummary: [
      { label: "Tracked SKUs", value: "0", caption: "No stock items on file." },
      { label: "Par variance", value: "0", caption: "No par levels configured." },
      { label: "Reorder queue", value: "0", caption: "No reorder alerts." },
    ],
    lowStockItems: [
      {
        title: "Stock visibility",
        detail: "No consumables catalog on file.",
        tone: "info",
      },
    ],
  };
}

function emptyDashboardModel(currency: string): DashboardAnalyticsModel {
  const dept = emptyDepartmentPlaceholders(currency);
  return {
    financialBase: {
      grossRevenueToday: 0,
      effectiveAverageRate: 0,
      occupancyRate: 0,
    },
    financialTrendViews: emptyFinancialTrendViews(),
    movementItems: [
      { label: "Arrivals today", value: "0", description: "No arrivals scheduled for today." },
      { label: "Departures today", value: "0", description: "No departures scheduled for today." },
      { label: "No-shows", value: "0", description: "Marked no-show in the last 7 days (UTC)." },
      { label: "Cancellations", value: "0", description: "Cancelled in the last 30 days (UTC)." },
    ],
    roomStatusItems: [
      { label: "Occupied", value: 0 },
      { label: "Vacant clean", value: 0 },
      { label: "Dirty", value: 0 },
      { label: "Inspected", value: 0 },
    ],
    floorStatusItems: [
      {
        label: "No room inventory",
        value: 0,
        color: "rgba(148, 163, 184, 0.78)",
        colorClass: "bg-slate-400",
      },
    ],
    occupancyTrend: { labels: [], values: [] },
    ...dept,
    operationalAlerts: [
      {
        title: "Operations clear",
        detail: "No property alerts from room or reservation data.",
        tone: "info",
      },
    ],
  };
}

function buildOperationalAlerts(
  rooms: RoomUnitRow[],
  reservations: ReservationRow[],
  now = new Date(),
): StatusRowItem[] {
  const alerts: StatusRowItem[] = [];
  const maint = rooms.filter((r) => r.status === "maintenance" || r.status === "out_of_order").length;
  const dirty = rooms.filter((r) => r.status === "dirty").length;
  const { startIso } = utcDayRangeIso(now);
  const noShowsWeek = reservations.filter(
    (r) =>
      r.status === "no_show" && parseTs(r.arrival_at) >= parseTs(startIso) - 7 * 86400000,
  ).length;

  if (maint > 0) {
    alerts.push({
      title: "Rooms offline",
      detail: `${maint} unit(s) in maintenance or out of order.`,
      tone: "warning",
    });
  }
  if (dirty >= 6) {
    alerts.push({
      title: "Housekeeping backlog",
      detail: `${dirty} rooms are still flagged dirty — align cleaning priorities.`,
      tone: "warning",
    });
  } else if (dirty > 0) {
    alerts.push({
      title: "Dirty rooms",
      detail: `${dirty} room(s) awaiting housekeeping turnover.`,
      tone: "info",
    });
  }
  if (noShowsWeek > 0) {
    alerts.push({
      title: "Recent no-shows",
      detail: `${noShowsWeek} reservation(s) marked no-show in the last week.`,
      tone: "critical",
    });
  }

  if (alerts.length === 0) {
    alerts.push({
      title: "Operations clear",
      detail: "No automated property alerts fired from room and reservation data.",
      tone: "info",
    });
  }
  return alerts;
}

export type DashboardMetricsResult = {
  model: DashboardAnalyticsModel;
  reservationRecordCount: number;
  inHouseGuestHeadcount: number;
};

/**
 * Loads dashboard analytics from hotel schema tables.
 * Room/floor "occupied" KPIs follow in-house check-ins on assigned keys (not raw `occupied` alone).
 */
export async function getHotelDashboardMetrics(params: {
  tenantId: string | null;
  /** From pricing setup — used when room inventory table is empty */
  totalRoomsFromPricing: number;
  averageRateFromPricing: number | null;
  currency: string;
}): Promise<DashboardMetricsResult> {
  const { tenantId, totalRoomsFromPricing, averageRateFromPricing, currency } = params;

  if (!tenantId) {
    return {
      model: emptyDashboardModel(currency),
      reservationRecordCount: 0,
      inHouseGuestHeadcount: 0,
    };
  }

  const supabase = createServerSupabaseClient();

  const [
    { data: roomRows, error: roomError },
    { data: resRows, error: resError },
    { data: folioRows, error: folioError },
    { data: fbOrderRows, error: fbOrderError },
    { data: fbOutletRows, error: fbOutletError },
    { data: fbItemRows, error: fbItemError },
    fbSettings,
  ] = await Promise.all([
    supabase.schema("hotel").from("room_units").select("id,status,floor").eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("reservations")
      .select(
        "status,arrival_at,departure_at,adults,children_json,rate_per_night,total_room_charges,checked_in_at,checked_out_at,room_unit_id",
      )
      .eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("folio_transactions")
      .select("reservation_id,kind,amount,voided_at,created_at")
      .eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("fb_orders")
      .select(
        "id,outlet_id,status,settlement_method,subtotal,closed_at,sent_to_kitchen_at,kitchen_ready_at,created_at,voided_at",
      )
      .eq("tenant_id", tenantId),
    supabase.schema("hotel").from("fb_outlets").select("id,name,outlet_type").eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("fb_order_items")
      .select("order_id,kitchen_status")
      .eq("tenant_id", tenantId),
    getTenantFbSettings(supabase, tenantId),
  ]);

  if (roomError || resError || folioError) {
    console.warn("[dashboard-metrics] hotel schema query failed:", roomError ?? resError ?? folioError);
    return {
      model: emptyDashboardModel(currency),
      reservationRecordCount: 0,
      inHouseGuestHeadcount: 0,
    };
  }

  const rooms = (roomRows ?? []) as RoomUnitRow[];
  const reservations = (resRows ?? []) as ReservationRow[];
  const folio = (folioRows ?? []) as FolioRevenueRow[];
  const now = new Date();
  const { startIso, nextIso } = utcDayRangeIso(now);

  const inventoryRooms = rooms.length > 0 ? rooms.length : Math.max(totalRoomsFromPricing, 1);

  const inHouseRes = reservations.filter((r) => r.status === "checked_in");
  const occupiedKeysFromStays = new Set(
    inHouseRes.map((r) => r.room_unit_id).filter((id): id is string => Boolean(id)),
  );

  const statusCounts = new Map<string, number>();
  for (const r of rooms) {
    let bucket: string;
    if (occupiedKeysFromStays.has(r.id)) {
      bucket = "occupied";
    } else if (r.status === "occupied") {
      bucket = "vacant_clean";
    } else {
      bucket = r.status;
    }
    statusCounts.set(bucket, (statusCounts.get(bucket) ?? 0) + 1);
  }

  const occupiedRooms = statusCounts.get("occupied") ?? 0;
  const vacantClean = statusCounts.get("vacant_clean") ?? 0;
  const dirtyRooms = statusCounts.get("dirty") ?? 0;
  const inspectedRooms = statusCounts.get("inspected") ?? 0;
  const maintenanceRooms =
    (statusCounts.get("maintenance") ?? 0) + (statusCounts.get("out_of_order") ?? 0);

  const roomStatusItems: RoomStatusItem[] = [
    { label: "Occupied", value: occupiedRooms },
    { label: "Vacant clean", value: vacantClean },
    { label: "Dirty", value: dirtyRooms },
    { label: "Inspected", value: inspectedRooms },
    ...(maintenanceRooms > 0 ? [{ label: "Maintenance / OOO", value: maintenanceRooms }] : []),
  ];

  const floorsPresent = new Set<number>();
  for (const r of rooms) {
    floorsPresent.add(r.floor);
  }
  const sortedFloors = [...floorsPresent].sort((a, b) => a - b);

  const occupiedByFloor = new Map<number, number>();
  for (const r of rooms) {
    if (!occupiedKeysFromStays.has(r.id)) continue;
    occupiedByFloor.set(r.floor, (occupiedByFloor.get(r.floor) ?? 0) + 1);
  }

  const palette = ["rgba(37, 99, 235, 0.9)", "rgba(14, 165, 233, 0.88)", "rgba(99, 102, 241, 0.88)"];
  const floorClasses = ["bg-blue-500", "bg-sky-500", "bg-indigo-500"];
  const floorStatusItems: FloorStatusItem[] = sortedFloors.map((fl, idx) => ({
    label: `Floor ${fl}`,
    value: occupiedByFloor.get(fl) ?? 0,
    color: palette[idx % palette.length] ?? "rgba(100, 116, 139, 0.85)",
    colorClass: floorClasses[idx % floorClasses.length] ?? "bg-slate-400",
  }));

  if (floorStatusItems.length === 0) {
    floorStatusItems.push({
      label: "No room inventory",
      value: 0,
      color: "rgba(148, 163, 184, 0.78)",
      colorClass: "bg-slate-400",
    });
  }

  const arrivalsToday = reservations.filter((r) => inUtcDay(r.arrival_at, now)).length;
  const pendingArrivals = reservations.filter((r) => inUtcDay(r.arrival_at, now) && r.status === "confirmed").length;

  const departuresToday = reservations.filter((r) => inUtcDay(r.departure_at, now)).length;
  const pendingCheckouts = reservations.filter(
    (r) => inUtcDay(r.departure_at, now) && r.status === "checked_in",
  ).length;

  const noShowsWindow = reservations.filter((r) => {
    if (r.status !== "no_show") return false;
    return parseTs(r.arrival_at) >= parseTs(startIso) - 7 * 86400000;
  }).length;

  const cancellationsWindow = reservations.filter((r) => {
    if (r.status !== "cancelled") return false;
    return parseTs(r.arrival_at) >= parseTs(startIso) - 30 * 86400000;
  }).length;

  const inHouseGuestHeadcount = countInHouseGuestHeadcount(reservations);

  const stayOversTonight = inHouseRes.filter((r) => parseTs(r.departure_at) > parseTs(nextIso)).length;

  const movementItems: MetricTileItem[] = [
    {
      label: "Arrivals today",
      value: String(arrivalsToday),
      description:
        pendingArrivals > 0
          ? `${pendingArrivals} reservation(s) still pending check-in`
          : "No pending arrivals for the rest of today.",
    },
    {
      label: "Departures today",
      value: String(departuresToday),
      description:
        pendingCheckouts > 0
          ? `${pendingCheckouts} in-house reservation(s) still need checkout`
          : "No departures pending checkout right now.",
    },
    {
      label: "No-shows",
      value: String(noShowsWindow),
      description: "Marked no-show in the last 7 days (UTC).",
    },
    {
      label: "Cancellations",
      value: String(cancellationsWindow),
      description: `${stayOversTonight} in-house guest(s) stay through tonight.`,
    },
  ];

  const fbOrders = (fbOrderRows ?? []) as DashboardFbOrderRow[];
  const grossRevenueToday = getGrossRevenueForUtcDay(folio, fbOrderError == null ? fbOrders : [], now);

  const adrSamples = inHouseRes.map((r) => num(r.rate_per_night));
  const effectiveAverageRate =
    adrSamples.length > 0
      ? Math.round(adrSamples.reduce((a, b) => a + b, 0) / adrSamples.length)
      : averageRateFromPricing ?? 0;

  const occupancyRate =
    inventoryRooms > 0 ? Math.min(100, Math.round((occupiedRooms / inventoryRooms) * 100)) : 0;

  const occupancyTrend = buildOccupancyTrendFromReservations(reservations, inventoryRooms);

  const financialTrendViews = buildFinancialTrendViews({
    folioRows: folio,
    fbOrders: fbOrderError == null ? fbOrders : [],
    reservations,
    totalRooms: inventoryRooms,
    reference: now,
  });

  const fbDataOk = fbOrderError == null && fbOutletError == null && fbItemError == null;
  const fbSections = fbDataOk
    ? buildDashboardFbSections({
        orders: fbOrders,
        outlets: (fbOutletRows ?? []) as DashboardFbOutletRow[],
        items: (fbItemRows ?? []) as DashboardFbItemRow[],
        currency,
        kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
        reference: now,
      })
    : null;
  const deptPlaceholders = emptyDepartmentPlaceholders(currency);
  const operationalAlerts = buildOperationalAlerts(rooms, reservations, now);

  const model: DashboardAnalyticsModel = {
    financialBase: {
      grossRevenueToday,
      effectiveAverageRate: effectiveAverageRate || 0,
      occupancyRate,
    },
    financialTrendViews,
    movementItems,
    roomStatusItems,
    floorStatusItems,
    occupancyTrend,
    foodAndBeverageItems: fbSections?.foodAndBeverageItems ?? deptPlaceholders.foodAndBeverageItems,
    outletBreakdownItems: fbSections?.outletBreakdownItems ?? deptPlaceholders.outletBreakdownItems,
    kitchenItems: fbSections?.kitchenItems ?? deptPlaceholders.kitchenItems,
    kitchenAlertItems: fbSections?.kitchenAlertItems ?? deptPlaceholders.kitchenAlertItems,
    inventorySummary: deptPlaceholders.inventorySummary,
    lowStockItems: deptPlaceholders.lowStockItems,
    operationalAlerts,
  };

  return {
    model,
    reservationRecordCount: reservations.length,
    inHouseGuestHeadcount,
  };
}
