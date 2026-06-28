import {
  buildDashboardAnalyticsModel,
  type DashboardAnalyticsModel,
  type FloorStatusItem,
  type OccupancyTrend,
  type RoomStatusItem,
} from "@/components/hms/dashboard/analytics/mock-data";
import type { MetricTileItem, StatusRowItem, SummaryTileItem } from "@/components/hms/dashboard/analytics/shared";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type FolioRevenueRow = {
  reservation_id: string;
  kind: string;
  amount: string | number;
  voided_at: string | null;
  created_at: string;
};

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

function inUtcDay(value: string, reference = new Date()) {
  const t = parseTs(value);
  const { startIso, nextIso } = utcDayRangeIso(reference);
  return t >= parseTs(startIso) && t < parseTs(nextIso);
}

function countChildrenJson(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  return raw.length;
}

function num(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Daily gross revenue from folio charges and payments posted today (UTC). */
export function computeGrossRevenueForUtcDay(
  transactions: FolioRevenueRow[],
  reference = new Date(),
): number {
  let fromCharges = 0;
  let fromPayments = 0;
  const chargesByReservation = new Map<string, number>();
  const paymentsByReservation = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.voided_at) continue;
    if (!inUtcDay(tx.created_at, reference)) continue;

    const reservationId = tx.reservation_id;
    const amount = num(tx.amount);

    if (tx.kind === "charge") {
      fromCharges += amount;
      chargesByReservation.set(reservationId, (chargesByReservation.get(reservationId) ?? 0) + amount);
    } else if (tx.kind === "payment") {
      const payment = Math.abs(amount);
      fromPayments += payment;
      paymentsByReservation.set(reservationId, (paymentsByReservation.get(reservationId) ?? 0) + payment);
    }
  }

  let sameDayOverlap = 0;
  for (const [reservationId, chargeTotal] of chargesByReservation) {
    const paymentTotal = paymentsByReservation.get(reservationId) ?? 0;
    sameDayOverlap += Math.min(chargeTotal, paymentTotal);
  }

  return Math.round((fromCharges + fromPayments - sameDayOverlap) * 100) / 100;
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
        description: "F&B module not connected — no live outlet totals yet.",
      },
      {
        label: "Orders today",
        value: "0",
        description: "Point-of-sale integration will populate order counts.",
      },
      {
        label: "Average bill",
        value: formatPricingAmount(0, currency),
        description: "Average cheque appears once cashier data is linked.",
      },
      {
        label: "Charge to room",
        value: formatPricingAmount(0, currency),
        description: "Room charges from outlets will post into folios here.",
      },
    ],
    outletBreakdownItems: [
      {
        title: "Restaurant",
        detail: "No restaurant sales feed configured for this property.",
        value: formatPricingAmount(0, currency),
        tone: "info",
      },
      {
        title: "Bar",
        detail: "No bar sales feed configured for this property.",
        value: formatPricingAmount(0, currency),
        tone: "info",
      },
      {
        title: "Room service",
        detail: "No room-service tickets synced yet.",
        value: formatPricingAmount(0, currency),
        tone: "info",
      },
    ],
    kitchenItems: [
      {
        label: "Open tickets",
        value: "0",
        description: "Kitchen display integration is not enabled.",
      },
      {
        label: "Average prep time",
        value: "—",
        description: "Prep timers will surface once the kitchen module is live.",
      },
      {
        label: "Delayed orders",
        value: "0",
        description: "Late orders appear when KDS data is connected.",
      },
      {
        label: "Ready for service",
        value: "0",
        description: "Expediter status will map from live kitchen events.",
      },
    ],
    kitchenAlertItems: [
      {
        title: "Kitchen data",
        detail: "Connect kitchen / KDS analytics to monitor tickets and delays here.",
        tone: "info",
      },
    ],
    inventorySummary: [
      { label: "Tracked SKUs", value: "0", caption: "Inventory module not linked." },
      { label: "Par variance", value: "0", caption: "Par levels appear after stock sync." },
      { label: "Reorder queue", value: "0", caption: "Procurement alerts will populate automatically." },
    ],
    lowStockItems: [
      {
        title: "Stock visibility",
        detail: "No consumables catalog is synced to HMS yet.",
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
  const { startIso, nextIso } = utcDayRangeIso(now);
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
      detail: "No automated property alerts fired from live room and reservation data.",
      tone: "info",
    });
  }
  return alerts;
}

export type DashboardMetricsResult = {
  model: DashboardAnalyticsModel;
  /** True when `hotel.room_units` / `hotel.reservations` returned without transport errors */
  usedLiveHotelData: boolean;
  reservationRecordCount: number;
  inHouseGuestHeadcount: number;
};

/**
 * Loads dashboard analytics from `hotel.room_units` and `hotel.reservations` when available.
 * Room/floor "occupied" KPIs follow in-house check-ins on assigned keys (not raw `occupied` alone).
 * Falls back to the legacy mock model only if Supabase errors (missing migration, network, etc.).
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
      model: buildDashboardAnalyticsModel({
        totalRooms: Math.max(totalRoomsFromPricing, 1),
        currency,
        averageRate: averageRateFromPricing,
      }),
      usedLiveHotelData: false,
      reservationRecordCount: 0,
      inHouseGuestHeadcount: 0,
    };
  }

  const supabase = createServerSupabaseClient();

  const [{ data: roomRows, error: roomError }, { data: resRows, error: resError }, { data: folioRows, error: folioError }] =
    await Promise.all([
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
  ]);

  if (roomError || resError || folioError) {
    console.warn("[dashboard-metrics] hotel schema query failed, using demo analytics:", roomError ?? resError ?? folioError);
    return {
      model: buildDashboardAnalyticsModel({
        totalRooms: Math.max(totalRoomsFromPricing, 1),
        currency,
        averageRate: averageRateFromPricing,
      }),
      usedLiveHotelData: false,
      reservationRecordCount: 0,
      inHouseGuestHeadcount: 0,
    };
  }

  const rooms = (roomRows ?? []) as RoomUnitRow[];
  const reservations = (resRows ?? []) as ReservationRow[];
  const now = new Date();
  const { startIso, nextIso } = utcDayRangeIso(now);

  const inventoryRooms = rooms.length > 0 ? rooms.length : Math.max(totalRoomsFromPricing, 1);

  const inHouseRes = reservations.filter((r) => r.status === "checked_in");
  const occupiedKeysFromStays = new Set(
    inHouseRes.map((r) => r.room_unit_id).filter((id): id is string => Boolean(id)),
  );

  // Inventory `status` can stay `occupied` after reservations are deleted. Align KPIs with
  // in-house stays: only keys with an active checked-in reservation count as occupied; stale
  // `occupied` rows roll into vacant clean for this summary (housekeeping can update keys later).
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

  const inHouseGuestHeadcount = inHouseRes.reduce(
    (sum, r) => sum + r.adults + countChildrenJson(r.children_json),
    0,
  );

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

  const grossRevenueToday = computeGrossRevenueForUtcDay(folioRows ?? [], now);

  const adrSamples = inHouseRes.map((r) => num(r.rate_per_night));
  const effectiveAverageRate =
    adrSamples.length > 0
      ? Math.round(adrSamples.reduce((a, b) => a + b, 0) / adrSamples.length)
      : averageRateFromPricing ?? 0;

  const occupancyRate =
    inventoryRooms > 0 ? Math.min(100, Math.round((occupiedRooms / inventoryRooms) * 100)) : 0;

  const occupancyTrend = buildOccupancyTrendFromReservations(reservations, inventoryRooms);

  const dept = emptyDepartmentPlaceholders(currency);
  const operationalAlerts = buildOperationalAlerts(rooms, reservations, now);

  const model: DashboardAnalyticsModel = {
    financialBase: {
      grossRevenueToday,
      effectiveAverageRate: effectiveAverageRate || 0,
      occupancyRate,
    },
    movementItems,
    roomStatusItems,
    floorStatusItems,
    occupancyTrend,
    ...dept,
    operationalAlerts,
  };

  return {
    model,
    usedLiveHotelData: true,
    reservationRecordCount: reservations.length,
    inHouseGuestHeadcount,
  };
}
