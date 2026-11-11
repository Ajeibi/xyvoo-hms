import type { ReportCell, ReportColumn, ReportDocument } from "@/lib/hms/reports/model";
import { formatLongDate } from "@/lib/hms/reports/dates";
import { percentChange, type PeriodFigures } from "@/lib/hms/reports/numbers";
import type { Consolidation, ConsolidatedRow } from "./group-consolidation";
import { openMonthsByHotel } from "./group-consolidation";
import type { GroupFigures } from "./group-dashboard";
import { shareOf } from "./group-figures";
import type { GroupHotel } from "./group-types";

/*
 * Group reports in the shared report shape (src/lib/hms/reports/model.ts), so the screen, the Excel,
 * PDF and CSV files and the scheduled email all show the same thing.
 */

const money = (v: number | null): ReportCell => ({ v, kind: "money" });
const count = (v: number | null): ReportCell => ({ v, kind: "number" });
const pct = (v: number | null): ReportCell => ({ v, kind: "percent" });

export const GROUP_REPORT_KEYS = ["performance", "trial-balance", "profit-and-loss", "balance-sheet"] as const;
export type GroupReportKey = (typeof GROUP_REPORT_KEYS)[number];

export function isGroupReportKey(value: string | null | undefined): value is GroupReportKey {
  return Boolean(value && (GROUP_REPORT_KEYS as readonly string[]).includes(value));
}

function periodRow(label: string, p: PeriodFigures | null, total: PeriodFigures, ly: PeriodFigures | null): Record<string, ReportCell> {
  if (!p) return { hotel: `${label} (figures unavailable)` };
  return {
    hotel: label,
    available: count(p.roomsAvailable),
    sold: count(p.roomsSold),
    occupancy: pct(p.occupancy),
    adr: money(p.adr),
    revpar: money(p.revpar),
    rooms: money(p.roomsRevenue),
    fb: money(p.fbRevenue),
    other: money(p.otherRevenue + p.unclassifiedRevenue),
    total: money(p.totalRevenue),
    share: pct(shareOf(p.totalRevenue, total.totalRevenue)),
    ly: ly ? (percentChange(p.totalRevenue, ly.totalRevenue) == null ? "—" : `${percentChange(p.totalRevenue, ly.totalRevenue)! > 0 ? "+" : ""}${percentChange(p.totalRevenue, ly.totalRevenue)}%`) : "—",
  };
}

/** Occupancy and revenue by hotel and for the group, for a date range. */
export function groupPerformanceDocument(groupName: string, figures: GroupFigures, currency: string): ReportDocument {
  const columns: ReportColumn[] = [
    { key: "hotel", label: "Hotel", kind: "text" },
    { key: "available", label: "Rooms available", kind: "number" },
    { key: "sold", label: "Rooms sold", kind: "number" },
    { key: "occupancy", label: "Occupancy", kind: "percent" },
    { key: "adr", label: "ADR", kind: "money" },
    { key: "revpar", label: "RevPAR", kind: "money" },
    { key: "rooms", label: "Rooms revenue", kind: "money" },
    { key: "fb", label: "F&B revenue", kind: "money" },
    { key: "other", label: "Other revenue", kind: "money" },
    { key: "total", label: "Total revenue", kind: "money" },
    { key: "share", label: "Share of group", kind: "percent" },
    { key: "ly", label: "vs last year", kind: "text" },
  ];
  const rows = figures.hotels.map((h) => periodRow(h.hotel.name, h.period, figures.totalPeriod, h.lastYear));
  const totals = periodRow("Group", figures.totalPeriod, figures.totalPeriod, figures.totalLastYear);
  const unavailable = figures.hotels.filter((h) => !h.ok).map((h) => h.hotel.name);
  return {
    key: "group-performance",
    title: `${groupName}: performance by hotel`,
    subtitle: figures.from && figures.to ? `${formatLongDate(figures.from)} to ${formatLongDate(figures.to)}` : "",
    currency,
    sections: [{ columns, rows, totals }],
    notes: [
      "Group occupancy, ADR and RevPAR are worked out from the group's total rooms and revenue, not averaged across hotels, so bigger hotels count for more.",
      "Each hotel's figures use the same rules as its own Reports screen. Dates are each hotel's own local dates.",
      ...(unavailable.length ? [`Not included (figures couldn't be read): ${unavailable.join(", ")}.`] : []),
    ],
  };
}

function statementColumns(hotels: GroupHotel[]): ReportColumn[] {
  return [
    { key: "code", label: "Code", kind: "text" },
    { key: "name", label: "Account", kind: "text" },
    ...hotels.map((h) => ({ key: `h_${h.tenantId}`, label: h.name, kind: "money" as const })),
    { key: "elim", label: "Eliminations", kind: "money" },
    { key: "total", label: "Group", kind: "money" },
  ];
}

function statementRow(r: ConsolidatedRow, hotels: GroupHotel[]): Record<string, ReportCell> {
  const row: Record<string, ReportCell> = { code: r.code, name: r.nameMismatch.length ? `${r.name} (named differently at another hotel)` : r.interCompany ? `${r.name} (inter-company)` : r.name };
  for (const h of hotels) row[`h_${h.tenantId}`] = money(r.byHotel[h.tenantId] ?? 0);
  row.elim = money(r.eliminations);
  row.total = money(r.total);
  return row;
}

function totalRow(label: string, rows: ConsolidatedRow[], hotels: GroupHotel[]): Record<string, ReportCell> {
  const row: Record<string, ReportCell> = { code: "", name: label };
  for (const h of hotels) row[`h_${h.tenantId}`] = money(Math.round(rows.reduce((s, r) => s + (r.byHotel[h.tenantId] ?? 0), 0) * 100) / 100);
  row.elim = money(Math.round(rows.reduce((s, r) => s + r.eliminations, 0) * 100) / 100);
  row.total = money(Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100);
  return row;
}

function baseNotes(c: Consolidation, periods: Array<{ month: string; final: boolean; openAt: string[] }>): string[] {
  const notes = ["Each hotel keeps its own books. Accounts are matched across hotels by their code."];
  if (c.interCompanyMismatch !== 0) notes.push(`Inter-company balances don't cancel out: ${c.interCompanyMismatch.toLocaleString("en-NG")} is left over. Check that both sides are marked and posted.`);
  const open = periods.filter((p) => !p.final);
  if (open.length) notes.push(`Not final. Months not yet closed: ${openMonthsByHotel(open)}.`);
  else if (periods.length) notes.push("Final: every hotel has closed every month in this range.");
  return notes;
}

export function trialBalanceDocument(groupName: string, hotels: GroupHotel[], c: Consolidation, to: string, currency: string, periods: Array<{ month: string; final: boolean; openAt: string[] }>): ReportDocument {
  return {
    key: "group-trial-balance",
    title: `${groupName}: consolidated trial balance`,
    subtitle: `Balances at ${formatLongDate(to)}. Assets and expenses are shown as debits, the rest as credits.`,
    currency,
    sections: [{ columns: statementColumns(hotels), rows: c.trialBalance.map((r) => statementRow(r, hotels)), emptyMessage: "No journal entries yet." }],
    notes: baseNotes(c, periods),
  };
}

export function profitAndLossDocument(groupName: string, hotels: GroupHotel[], c: Consolidation, from: string, to: string, currency: string, periods: Array<{ month: string; final: boolean; openAt: string[] }>): ReportDocument {
  const cols = statementColumns(hotels);
  const net: Record<string, ReportCell> = { code: "", name: "Net profit" };
  for (const h of hotels) net[`h_${h.tenantId}`] = money(c.profitAndLoss.netByHotel[h.tenantId] ?? 0);
  net.elim = money(c.profitAndLoss.netEliminations);
  net.total = money(c.profitAndLoss.netTotal);
  return {
    key: "group-profit-and-loss",
    title: `${groupName}: consolidated profit and loss`,
    subtitle: `${formatLongDate(from)} to ${formatLongDate(to)}`,
    currency,
    sections: [
      { title: "Revenue", columns: cols, rows: c.profitAndLoss.revenue.map((r) => statementRow(r, hotels)), totals: totalRow("Total revenue", c.profitAndLoss.revenue, hotels), emptyMessage: "No revenue in this period." },
      { title: "Expenses", columns: cols, rows: c.profitAndLoss.expenses.map((r) => statementRow(r, hotels)), totals: totalRow("Total expenses", c.profitAndLoss.expenses, hotels), emptyMessage: "No expenses in this period." },
      { title: "Result", columns: cols, rows: [net] },
    ],
    notes: baseNotes(c, periods),
  };
}

export function balanceSheetDocument(groupName: string, hotels: GroupHotel[], c: Consolidation, to: string, currency: string, periods: Array<{ month: string; final: boolean; openAt: string[] }>): ReportDocument {
  const cols = statementColumns(hotels);
  const bs = c.balanceSheet;
  const earnings: Record<string, ReportCell> = { code: "", name: "Profit to date not yet closed into equity" };
  const diff: Record<string, ReportCell> = { code: "", name: "Difference (should be 0)" };
  for (const h of hotels) {
    earnings[`h_${h.tenantId}`] = money(bs.currentEarningsByHotel[h.tenantId] ?? 0);
    diff[`h_${h.tenantId}`] = money(bs.differenceByHotel[h.tenantId] ?? 0);
  }
  earnings.elim = money(0);
  earnings.total = money(bs.currentEarningsTotal);
  diff.elim = money(0);
  diff.total = money(bs.differenceTotal);
  return {
    key: "group-balance-sheet",
    title: `${groupName}: consolidated balance sheet`,
    subtitle: `At ${formatLongDate(to)}`,
    currency,
    sections: [
      { title: "Assets", columns: cols, rows: bs.assets.map((r) => statementRow(r, hotels)), totals: totalRow("Total assets", bs.assets, hotels) },
      { title: "Liabilities", columns: cols, rows: bs.liabilities.map((r) => statementRow(r, hotels)), totals: totalRow("Total liabilities", bs.liabilities, hotels) },
      { title: "Equity", columns: cols, rows: [...bs.equity.map((r) => statementRow(r, hotels)), earnings], totals: totalRow("Total equity (before profit to date)", bs.equity, hotels) },
      { title: "Check", columns: cols, rows: [diff] },
    ],
    notes: baseNotes(c, periods),
  };
}
