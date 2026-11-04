import type { SupabaseClient } from "@supabase/supabase-js";
import { eachDate, formatLongDate, hotelDate, monthStart, yearAgo, yearStart } from "@/lib/hms/reports/dates";
import {
  getFirstActivityDate,
  getReportTimeZone,
  getRoomCount,
  hadActivityYearBefore,
  loadPeriodData,
  loadRevenueBudgets,
  type RevenueBudgets,
} from "@/lib/hms/reports/load";
import type { ReportCell, ReportDocument, ReportSection } from "@/lib/hms/reports/model";
import { buildDaySeries, percentChange, proratedBudget, round2, sumPeriod, type PeriodFigures } from "@/lib/hms/reports/numbers";

/*
 * The manager's daily report: one day, the month to date and the year to date, each against the same
 * period last year and against the budget. A comparison with nothing behind it says so ("No budget
 * set", "No data last year") instead of showing a number.
 */

export type Budgeted = { rooms: number | null; fb: number | null; other: number | null; total: number | null };

export type ManagersColumn = {
  key: "day" | "mtd" | "ytd";
  label: string;
  from: string;
  to: string;
  actual: PeriodFigures;
  /** Null when the hotel was not trading a year ago. */
  lastYear: PeriodFigures | null;
  /** Revenue budgets for the period; each is null when none was set. */
  budget: Budgeted;
};

export type ManagersReport = {
  date: string;
  today: string;
  currency: string;
  roomCount: number;
  columns: ManagersColumn[];
};

/** Budget for a period: null when no month it touches has a budget for that department. */
function budgetFor(monthly: Map<string, number>, from: string, to: string): number | null {
  const months = new Set(eachDate(from, to).map((d) => `${d.slice(0, 7)}-01`));
  const any = [...months].some((m) => (monthly.get(m) ?? 0) > 0);
  return any ? proratedBudget(monthly, from, to) : null;
}

export function budgetedFor(budgets: RevenueBudgets, from: string, to: string): Budgeted {
  const rooms = budgetFor(budgets.rooms, from, to);
  const fb = budgetFor(budgets.fb, from, to);
  const other = budgetFor(budgets.other, from, to);
  const parts = [rooms, fb, other].filter((v): v is number => v != null);
  return { rooms, fb, other, total: parts.length ? round2(parts.reduce((s, v) => s + v, 0)) : null };
}

export async function getManagersReport(service: SupabaseClient, tenantId: string, date: string, currency: string): Promise<ManagersReport> {
  const timeZone = await getReportTimeZone(service, tenantId);
  const today = hotelDate(new Date(), timeZone);
  const start = yearStart(date);
  const lyDate = yearAgo(date);
  const lyStart = yearStart(lyDate);

  const [roomCount, firstActivity, thisYear, lastYear, budgets] = await Promise.all([
    getRoomCount(service, tenantId),
    getFirstActivityDate(service, tenantId),
    loadPeriodData(service, tenantId, start, date, timeZone),
    loadPeriodData(service, tenantId, lyStart, lyDate, timeZone),
    loadRevenueBudgets(service, tenantId, monthStart(start), monthStart(date)),
  ]);

  const dateOf = (instant: string) => hotelDate(instant, timeZone);
  const series = buildDaySeries({ dates: eachDate(start, date), roomCount, ...thisYear, today, dateOf });
  const lySeries = buildDaySeries({ dates: eachDate(lyStart, lyDate), roomCount, ...lastYear, today, dateOf });
  const hasLastYear = hadActivityYearBefore(firstActivity, date);

  const spans: { key: ManagersColumn["key"]; label: string; from: string; to: string }[] = [
    { key: "day", label: "Day", from: date, to: date },
    { key: "mtd", label: "Month to date", from: monthStart(date), to: date },
    { key: "ytd", label: "Year to date", from: start, to: date },
  ];

  return {
    date,
    today,
    currency,
    roomCount,
    columns: spans.map((s) => ({
      ...s,
      actual: sumPeriod(series, s.from, s.to),
      lastYear: hasLastYear ? sumPeriod(lySeries, yearAgo(s.from), yearAgo(s.to)) : null,
      budget: budgetedFor(budgets, s.from, s.to),
    })),
  };
}

const money = (v: number | null): ReportCell => ({ v, kind: "money" });
const count = (v: number | null): ReportCell => ({ v, kind: "number" });
const pct = (v: number | null): ReportCell => ({ v, kind: "percent" });

function changeText(now: number | null, then: number | null): string {
  const c = percentChange(now, then);
  if (c == null) return "—";
  return `${c > 0 ? "+" : ""}${c}%`;
}

function pointsText(now: number | null, then: number | null): string {
  if (now == null || then == null) return "—";
  const d = Math.round((now - then) * 10) / 10;
  return `${d > 0 ? "+" : ""}${d} pts`;
}

type Measure = {
  label: string;
  pick: (p: PeriodFigures) => number | null;
  as: (v: number | null) => ReportCell;
  budget?: (b: Budgeted) => number | null;
  points?: boolean;
};

const MEASURES: Measure[] = [
  { label: "Rooms available", pick: (p) => p.roomsAvailable, as: count },
  { label: "Rooms sold", pick: (p) => p.roomsSold, as: count },
  { label: "Occupancy", pick: (p) => p.occupancy, as: pct, points: true },
  { label: "ADR (average daily rate)", pick: (p) => p.adr, as: money },
  { label: "RevPAR (revenue per available room)", pick: (p) => p.revpar, as: money },
  { label: "Rooms revenue", pick: (p) => p.roomsRevenue, as: money, budget: (b) => b.rooms },
  { label: "Food and beverage revenue", pick: (p) => p.fbRevenue, as: money, budget: (b) => b.fb },
  { label: "Other revenue", pick: (p) => p.otherRevenue + p.unclassifiedRevenue, as: money, budget: (b) => b.other },
  { label: "Total revenue", pick: (p) => p.totalRevenue, as: money, budget: (b) => b.total },
];

function sectionFor(col: ManagersColumn): ReportSection {
  const range = col.from === col.to ? formatLongDate(col.from) : `${formatLongDate(col.from)} to ${formatLongDate(col.to)}`;
  return {
    title: `${col.label} · ${range}`,
    columns: [
      { key: "measure", label: "Measure", kind: "text" },
      { key: "actual", label: "Actual", kind: "text" },
      { key: "lastYear", label: "Same period last year", kind: "text" },
      { key: "vsLastYear", label: "Change", kind: "text" },
      { key: "budget", label: "Budget", kind: "text" },
      { key: "vsBudget", label: "Against budget", kind: "text" },
    ],
    rows: MEASURES.map((m) => {
      const actual = m.pick(col.actual);
      const ly = col.lastYear ? m.pick(col.lastYear) : null;
      const budget = m.budget ? m.budget(col.budget) : undefined;
      return {
        measure: m.label,
        actual: m.as(actual),
        lastYear: col.lastYear ? m.as(ly) : "No data last year",
        vsLastYear: !col.lastYear ? "—" : m.points ? pointsText(actual, ly) : changeText(actual, ly),
        budget: m.budget ? (budget == null ? "No budget set" : m.as(budget)) : "—",
        vsBudget:
          m.budget && budget != null && actual != null
            ? `${actual - budget >= 0 ? "+" : ""}${Math.round(actual - budget).toLocaleString("en-GB")} (${budget > 0 ? Math.round((actual / budget) * 100) : 0}% of budget)`
            : "—",
      };
    }),
  };
}

export function managersReportDocument(report: ManagersReport): ReportDocument {
  return {
    key: "managers",
    title: "Manager's daily report",
    subtitle: formatLongDate(report.date),
    currency: report.currency,
    sections: report.columns.map(sectionFor),
    notes: [
      `Rooms available counts all ${report.roomCount} rooms in your inventory; rooms taken out of service are not removed.`,
      "Rooms sold counts stays that held the room that night (in house or checked out; a confirmed stay counts from tonight on).",
      "ADR and RevPAR use room-rate revenue: each stay's room charge after booking discounts, before tax, shared over its nights.",
      "Rooms revenue also includes rooms charges posted that day apart from the booked stay (extra nights, fees, credits). Food and beverage and other revenue are bill lines and walk-in outlet sales on the day they were posted.",
      "Budgets come from Accounts, Budgets (revenue accounts 4000, 4100 and 4200), spread evenly over the days of each month.",
      "Last year compares the same dates a year ago, using today's room count. It only shows when the hotel was already trading then.",
    ],
  };
}
