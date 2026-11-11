import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, eachDate, hotelDate, hotelDayStart, monthStart, yearAgo } from "@/lib/hms/reports/dates";
import { getReportTimeZone, getRoomInventory, loadPeriodData } from "@/lib/hms/reports/load";
import { buildDaySeries, sumPeriod, type PeriodFigures } from "@/lib/hms/reports/numbers";
import { combinePeriods } from "./group-figures";
import type { GroupHotel } from "./group-types";

/*
 * The group dashboard and the group's period report: every hotel's figures, worked out with the same
 * loaders and arithmetic as each hotel's own reports (src/lib/hms/reports), then added up.
 *
 * Everything is read with the caller's own token (userDb), so the database only returns hotels the
 * caller may see. A hotel whose figures can't be read shows as unavailable instead of a zero.
 */

export type HotelDayStatus = {
  arrivalsToday: number;
  departuresToday: number;
  inHouse: number;
  outOfOrder: number;
  roomCount: number;
  lastAuditDate: string | null;
};

export type GroupHotelFigures = {
  hotel: GroupHotel;
  ok: boolean;
  error: string | null;
  today: string;
  day: PeriodFigures | null;
  period: PeriodFigures | null;
  lastYear: PeriodFigures | null;
  status: HotelDayStatus | null;
};

export type GroupFigures = {
  from: string;
  to: string;
  hotels: GroupHotelFigures[];
  totalDay: PeriodFigures;
  totalPeriod: PeriodFigures;
  totalLastYear: PeriodFigures | null;
  totalStatus: HotelDayStatus;
};

async function countRows(q: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function loadHotelStatus(userDb: SupabaseClient, tenantId: string, today: string, timeZone: string, rooms: { total: number; outOfOrder: number }): Promise<HotelDayStatus> {
  const start = hotelDayStart(today, timeZone);
  const end = hotelDayStart(addDays(today, 1), timeZone);
  const db = userDb.schema("hotel");
  const [arrivalsToday, departuresToday, inHouse, audit] = await Promise.all([
    countRows(db.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "confirmed").gte("arrival_at", start).lt("arrival_at", end)),
    countRows(db.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "checked_in").gte("departure_at", start).lt("departure_at", end)),
    countRows(db.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "checked_in")),
    db.from("night_audit_runs").select("audit_date").eq("tenant_id", tenantId).order("audit_date", { ascending: false }).limit(1).maybeSingle(),
  ]);
  return {
    arrivalsToday,
    departuresToday,
    inHouse,
    outOfOrder: rooms.outOfOrder,
    roomCount: rooms.total,
    lastAuditDate: (audit.data?.audit_date as string) ?? null,
  };
}

async function loadHotelFigures(userDb: SupabaseClient, hotel: GroupHotel, from: string | null, to: string | null, withLastYear: boolean): Promise<GroupHotelFigures> {
  try {
    const timeZone = await getReportTimeZone(userDb, hotel.tenantId);
    const today = hotelDate(new Date(), timeZone);
    const periodTo = to ?? today;
    const periodFrom = from ?? monthStart(periodTo);
    const first = periodFrom < today ? periodFrom : today;
    const last = periodTo > today ? periodTo : today;
    const rooms = await getRoomInventory(userDb, hotel.tenantId);
    const [data, lyData, status] = await Promise.all([
      loadPeriodData(userDb, hotel.tenantId, first, last, timeZone),
      withLastYear ? loadPeriodData(userDb, hotel.tenantId, yearAgo(periodFrom), yearAgo(periodTo), timeZone) : Promise.resolve(null),
      loadHotelStatus(userDb, hotel.tenantId, today, timeZone, rooms),
    ]);
    const dateOf = (instant: string) => hotelDate(instant, timeZone);
    const series = buildDaySeries({ dates: eachDate(first, last), roomCount: rooms.total, outOfOrder: rooms.outOfOrder, ...data, today, dateOf });
    const lySeries = lyData
      ? buildDaySeries({ dates: eachDate(yearAgo(periodFrom), yearAgo(periodTo)), roomCount: rooms.total, outOfOrder: rooms.outOfOrder, ...lyData, today, dateOf })
      : null;
    return {
      hotel,
      ok: true,
      error: null,
      today,
      day: sumPeriod(series, today, today),
      period: sumPeriod(series, periodFrom, periodTo),
      lastYear: lySeries ? sumPeriod(lySeries, yearAgo(periodFrom), yearAgo(periodTo)) : null,
      status,
    };
  } catch (e) {
    return { hotel, ok: false, error: e instanceof Error ? e.message : "Couldn't read this hotel's figures.", today: "", day: null, period: null, lastYear: null, status: null };
  }
}

/**
 * Figures for every hotel in the group and the group total. Without dates: today and month to date
 * at each hotel (each hotel's own date, from its own time zone).
 */
export async function loadGroupFigures(userDb: SupabaseClient, hotels: GroupHotel[], range?: { from: string; to: string }, withLastYear = false): Promise<GroupFigures> {
  const rows = await Promise.all(hotels.map((h) => loadHotelFigures(userDb, h, range?.from ?? null, range?.to ?? null, withLastYear)));
  const ok = rows.filter((r) => r.ok);
  const from = range?.from ?? ok[0]?.period?.from ?? "";
  const to = range?.to ?? ok[0]?.period?.to ?? "";
  const statuses = ok.map((r) => r.status!).filter(Boolean);
  return {
    from,
    to,
    hotels: rows,
    totalDay: combinePeriods(ok.map((r) => r.day!).filter(Boolean), ok[0]?.today ?? "", ok[0]?.today ?? ""),
    totalPeriod: combinePeriods(ok.map((r) => r.period!).filter(Boolean), from, to),
    totalLastYear: withLastYear && ok.every((r) => r.lastYear) ? combinePeriods(ok.map((r) => r.lastYear!), from ? yearAgo(from) : "", to ? yearAgo(to) : "") : null,
    totalStatus: {
      arrivalsToday: statuses.reduce((s, x) => s + x.arrivalsToday, 0),
      departuresToday: statuses.reduce((s, x) => s + x.departuresToday, 0),
      inHouse: statuses.reduce((s, x) => s + x.inHouse, 0),
      outOfOrder: statuses.reduce((s, x) => s + x.outOfOrder, 0),
      roomCount: statuses.reduce((s, x) => s + x.roomCount, 0),
      lastAuditDate: null,
    },
  };
}
