import type { FinanceMetric, FinancialTrendView, FinancialTrendViews } from "@/components/hms/dashboard/analytics/dashboard-analytics-types";
import { addDays, formatShortDate } from "@/lib/hms/reports/dates";
import { sumPeriod, type DayFigures } from "@/lib/hms/reports/numbers";

/*
 * The dashboard's financial charts, built from the same day-by-day figures as the reports (see
 * reports/numbers.ts), so the dashboard and the manager's report always agree. Revenue is room-rate
 * revenue per night plus other rooms lines, food and beverage and other departments on the day posted.
 */

/** Days of figures the charts need: the quarter view reaches back 13 weeks. */
export const DASHBOARD_TREND_DAYS = 91;

const METRICS: FinanceMetric[] = ["revenue", "occupancy", "adr", "revpar"];

function zeroed(length: number): Record<FinanceMetric, number[]> {
  return Object.fromEntries(METRICS.map((m) => [m, Array.from({ length }, () => 0)])) as Record<FinanceMetric, number[]>;
}

/** One chart point per range. A range with no rooms sold has no ADR, which the chart shows as 0. */
function view(labels: string[], ranges: [string, string][], series: DayFigures[], unitLabel: string, summary: string): FinancialTrendView {
  const metrics = zeroed(ranges.length);
  ranges.forEach(([from, to], i) => {
    const p = sumPeriod(series, from, to);
    metrics.revenue[i] = Math.round(p.totalRevenue);
    metrics.occupancy[i] = p.occupancy == null ? 0 : Math.round(p.occupancy);
    metrics.adr[i] = p.adr == null ? 0 : Math.round(p.adr);
    metrics.revpar[i] = p.revpar == null ? 0 : Math.round(p.revpar);
  });
  return { labels, unitLabel, summary, metrics };
}

export function emptyTrendViews(): FinancialTrendViews {
  const empty = (length: number, unitLabel: string, summary: string): FinancialTrendView => ({
    labels: Array.from({ length }, () => "—"),
    unitLabel,
    summary,
    metrics: zeroed(length),
  });
  return {
    week: empty(7, "day", "Revenue for the last 7 days."),
    month: empty(30, "day", "Revenue for the last 30 days."),
    quarter: empty(13, "week", "Revenue for the last 13 weeks."),
  };
}

export function buildDashboardTrendViews(series: DayFigures[], today: string): FinancialTrendViews {
  const day = (offset: number): [string, string] => {
    const d = addDays(today, -offset);
    return [d, d];
  };
  const days = (count: number) => Array.from({ length: count }, (_, i) => day(count - 1 - i));
  const week = days(7);
  const month = days(30);
  const weeks = Array.from({ length: 13 }, (_, i): [string, string] => {
    const end = addDays(today, -(12 - i) * 7);
    return [addDays(end, -6), end];
  });
  return {
    week: view(week.map(([d]) => formatShortDate(d)), week, series, "day", "Revenue, room nights sold and room rates for each of the last 7 days (hotel time)."),
    month: view(month.map(([d]) => formatShortDate(d)), month, series, "day", "Revenue, room nights sold and room rates for each of the last 30 days (hotel time)."),
    quarter: view(weeks.map(([from]) => `Wk ${formatShortDate(from)}`), weeks, series, "week", "Weekly totals for the last 13 weeks (hotel time)."),
  };
}
