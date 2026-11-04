import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, eachDate, formatLongDate, formatShortDate, hotelDate, weekStart, yearAgo } from "@/lib/hms/reports/dates";
import { getFirstActivityDate, getReportTimeZone, getRoomCount, hadActivityYearBefore, loadStays } from "@/lib/hms/reports/load";
import type { ReportCell, ReportDocument } from "@/lib/hms/reports/model";
import { nightsSold, percentChange, round2, type StayRow } from "@/lib/hms/reports/numbers";

/*
 * Forecast and booking pace. The forecast is what is already booked (rooms on the books and the room
 * revenue they carry); nothing is guessed on top. Pick-up is what was booked in the last 1, 7, 14 and
 * 30 days for stays in the next 30, 60 and 90 days. Pace against last year looks at the same stay
 * dates a year ago as they stood at this time last year, and as they finally turned out.
 *
 * A booking later cancelled has no cancel date on record, so pick-up and last year's "then" figure
 * leave cancelled bookings out altogether.
 */

export const HORIZONS = [30, 60, 90] as const;
export const PICKUP_WINDOWS = [1, 7, 14, 30] as const;

export type ForecastDay = { date: string; roomsSold: number; roomsAvailable: number; occupancy: number | null; roomRevenue: number; adr: number | null };

export type Totals = { nights: number; revenue: number; available: number; occupancy: number | null; adr: number | null };

export type PaceCompare = {
  /** Nights on the books now. */
  now: number;
  /** Nights that were on the books a year ago, for the same stay dates, at this time of year. */
  lastYearThen: number;
  /** Nights those stay dates finally held last year. */
  lastYearFinal: number;
};

export type ForecastReport = {
  today: string;
  currency: string;
  roomCount: number;
  days: ForecastDay[];
  horizons: { days: number; totals: Totals; pace: PaceCompare | null }[];
  /** nights and revenue booked in each window, by horizon. */
  pickup: { windowDays: number; byHorizon: { days: number; nights: number; revenue: number }[] }[];
  weeks: { start: string; nights: number; available: number; occupancy: number | null; revenue: number }[];
  hasLastYear: boolean;
};

function totals(days: ForecastDay[]): Totals {
  const nights = days.reduce((s, d) => s + d.roomsSold, 0);
  const available = days.reduce((s, d) => s + d.roomsAvailable, 0);
  const revenue = round2(days.reduce((s, d) => s + d.roomRevenue, 0));
  return {
    nights,
    revenue,
    available,
    occupancy: available > 0 ? Math.round((nights / available) * 1000) / 10 : null,
    adr: nights > 0 ? round2(revenue / nights) : null,
  };
}

/** Nights and room-rate revenue held on `dates` by stays booked at or before `bookedBy`. */
export function onTheBooks(stays: StayRow[], dates: string[], today: string, bookedBy?: string): { nights: number; revenue: number } {
  const subset = bookedBy ? stays.filter((s) => s.created_at <= bookedBy) : stays;
  let nights = 0;
  let revenue = 0;
  for (const v of nightsSold(subset, dates, today).values()) {
    nights += v.sold;
    revenue += v.revenue;
  }
  return { nights, revenue: round2(revenue) };
}

export async function getForecastReport(service: SupabaseClient, tenantId: string, currency: string, now = new Date()): Promise<ForecastReport> {
  const timeZone = await getReportTimeZone(service, tenantId);
  const today = hotelDate(now, timeZone);
  const last = addDays(today, 89);
  const lyToday = yearAgo(today);

  const [roomCount, firstActivity, stays, lyStays] = await Promise.all([
    getRoomCount(service, tenantId),
    getFirstActivityDate(service, tenantId),
    loadStays(service, tenantId, today, last),
    loadStays(service, tenantId, lyToday, yearAgo(last)),
  ]);
  return buildForecast({ today, currency, roomCount, stays, lyStays, hasLastYear: hadActivityYearBefore(firstActivity, today), now });
}

export function buildForecast(p: {
  today: string;
  currency: string;
  roomCount: number;
  stays: StayRow[];
  lyStays: StayRow[];
  hasLastYear: boolean;
  now: Date;
}): ForecastReport {
  const dates = eachDate(p.today, addDays(p.today, 89));
  const sold = nightsSold(p.stays, dates, p.today);
  const days: ForecastDay[] = dates.map((date) => {
    const s = sold.get(date)!;
    return {
      date,
      roomsSold: s.sold,
      roomsAvailable: p.roomCount,
      occupancy: p.roomCount > 0 ? Math.round((s.sold / p.roomCount) * 1000) / 10 : null,
      roomRevenue: round2(s.revenue),
      adr: s.sold > 0 ? round2(s.revenue / s.sold) : null,
    };
  });

  // "This time last year": the moment a year ago, as a timestamp comparable with created_at.
  const lyNow = new Date(p.now);
  lyNow.setUTCFullYear(lyNow.getUTCFullYear() - 1);
  const lyBookedBy = lyNow.toISOString();

  const horizons = HORIZONS.map((n) => {
    const slice = days.slice(0, n);
    let pace: PaceCompare | null = null;
    if (p.hasLastYear) {
      const lyDates = eachDate(yearAgo(p.today), yearAgo(addDays(p.today, n - 1)));
      // Last year's stays are over, so their final status says whether the room was held.
      pace = {
        now: slice.reduce((s, d) => s + d.roomsSold, 0),
        lastYearThen: onTheBooks(p.lyStays, lyDates, p.today, lyBookedBy).nights,
        lastYearFinal: onTheBooks(p.lyStays, lyDates, p.today).nights,
      };
    }
    return { days: n, totals: totals(slice), pace };
  });

  const pickup = PICKUP_WINDOWS.map((windowDays) => {
    const since = new Date(p.now.getTime() - windowDays * 86_400_000).toISOString();
    const recent = p.stays.filter((s) => s.created_at >= since);
    return {
      windowDays,
      byHorizon: HORIZONS.map((n) => {
        const r = onTheBooks(recent, dates.slice(0, n), p.today);
        return { days: n, nights: r.nights, revenue: r.revenue };
      }),
    };
  });

  const weekMap = new Map<string, ForecastDay[]>();
  for (const d of days) {
    const key = weekStart(d.date);
    weekMap.set(key, [...(weekMap.get(key) ?? []), d]);
  }
  const weeks = [...weekMap.entries()].map(([start, ds]) => {
    const t = totals(ds);
    return { start, nights: t.nights, available: t.available, occupancy: t.occupancy, revenue: t.revenue };
  });

  return { today: p.today, currency: p.currency, roomCount: p.roomCount, days, horizons, pickup, weeks, hasLastYear: p.hasLastYear };
}

const num = (v: number | null): ReportCell => ({ v, kind: "number" });
const money = (v: number | null): ReportCell => ({ v, kind: "money" });
const pct = (v: number | null): ReportCell => ({ v, kind: "percent" });

export function forecastDocument(r: ForecastReport): ReportDocument {
  const change = (c: PaceCompare | null) => {
    if (!c) return "No data last year";
    const v = percentChange(c.now, c.lastYearThen);
    return v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`;
  };
  return {
    key: "forecast",
    title: "Forecast and booking pace",
    subtitle: `From ${formatLongDate(r.today)}, next 90 days`,
    currency: r.currency,
    sections: [
      {
        title: "On the books",
        columns: [
          { key: "horizon", label: "Period", kind: "text" },
          { key: "nights", label: "Room nights booked", kind: "number" },
          { key: "occupancy", label: "Occupancy", kind: "percent" },
          { key: "revenue", label: "Room revenue booked", kind: "money" },
          { key: "adr", label: "ADR", kind: "money" },
          { key: "lyThen", label: "Nights booked this time last year", kind: "text" },
          { key: "pace", label: "Pace against last year", kind: "text" },
          { key: "lyFinal", label: "Nights last year finally", kind: "text" },
        ],
        rows: r.horizons.map((h) => ({
          horizon: `Next ${h.days} days`,
          nights: num(h.totals.nights),
          occupancy: pct(h.totals.occupancy),
          revenue: money(h.totals.revenue),
          adr: money(h.totals.adr),
          lyThen: h.pace ? num(h.pace.lastYearThen) : "No data last year",
          pace: change(h.pace),
          lyFinal: h.pace ? num(h.pace.lastYearFinal) : "No data last year",
        })),
      },
      {
        title: "Pick-up: room nights booked in the last…",
        columns: [
          { key: "window", label: "Booked in the last", kind: "text" },
          ...r.horizons.map((h) => ({ key: `h${h.days}`, label: `For the next ${h.days} days`, kind: "number" as const })),
          { key: "rev", label: "Room revenue (next 90 days)", kind: "money" as const },
        ],
        rows: r.pickup.map((p) => ({
          window: p.windowDays === 1 ? "24 hours" : `${p.windowDays} days`,
          ...Object.fromEntries(p.byHorizon.map((b) => [`h${b.days}`, num(b.nights)])),
          rev: money(p.byHorizon[p.byHorizon.length - 1]?.revenue ?? 0),
        })),
      },
      {
        title: "Week by week",
        columns: [
          { key: "week", label: "Week starting", kind: "text" },
          { key: "nights", label: "Room nights booked", kind: "number" },
          { key: "available", label: "Room nights available", kind: "number" },
          { key: "occupancy", label: "Occupancy", kind: "percent" },
          { key: "revenue", label: "Room revenue booked", kind: "money" },
        ],
        rows: r.weeks.map((w) => ({
          week: formatShortDate(w.start),
          nights: num(w.nights),
          available: num(w.available),
          occupancy: pct(w.occupancy),
          revenue: money(w.revenue),
        })),
      },
      {
        title: "Day by day",
        columns: [
          { key: "date", label: "Date", kind: "date" },
          { key: "sold", label: "Rooms booked", kind: "number" },
          { key: "occupancy", label: "Occupancy", kind: "percent" },
          { key: "revenue", label: "Room revenue booked", kind: "money" },
          { key: "adr", label: "ADR", kind: "money" },
        ],
        rows: r.days.map((d) => ({ date: d.date, sold: num(d.roomsSold), occupancy: pct(d.occupancy), revenue: money(d.roomRevenue), adr: money(d.adr) })),
      },
    ],
    notes: [
      `The forecast is what is already booked (confirmed and in-house stays) out of ${r.roomCount} rooms. Nothing is guessed on top, so it only grows as bookings come in.`,
      "Room revenue is each stay's room charge after booking discounts, before tax, shared over its nights.",
      "Pick-up counts bookings made in each window that are still active. A booking cancelled later has no cancel date on record, so cancelled bookings are left out of pick-up and of last year's figures.",
      "Last year compares the same stay dates a year ago: what was booked at this time then, and how many nights those dates finally held.",
    ],
  };
}
