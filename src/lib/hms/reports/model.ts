/*
 * The shape every report is built into. The screen, the Excel file, the PDF, the CSV and the scheduled
 * email all read this, so what a manager sees is exactly what they download.
 */

export type ColumnKind = "text" | "money" | "number" | "percent" | "date";

export type ReportColumn = { key: string; label: string; kind: ColumnKind };

/** A value, or a value with its own kind (for tables that mix money and percentages down a column). */
export type ReportCell = string | number | null | { v: string | number | null; kind: ColumnKind };

export type ReportSection = {
  title?: string;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  /** Shown under the rows, same keys as the rows. */
  totals?: Record<string, ReportCell>;
  /** Said instead of an empty table. */
  emptyMessage?: string;
};

export type ReportDocument = {
  key: string;
  title: string;
  /** The period or date the report is for, in words. */
  subtitle: string;
  currency: string;
  sections: ReportSection[];
  /** Plain notes under the tables: how a figure is worked out, what is missing. */
  notes: string[];
};

export function cellValue(cell: ReportCell | undefined): string | number | null {
  if (cell == null) return null;
  return typeof cell === "object" ? cell.v : cell;
}

export function cellKind(cell: ReportCell | undefined, column: ReportColumn): ColumnKind {
  return cell != null && typeof cell === "object" ? cell.kind : column.kind;
}

const CURRENCY_SYMBOL: Record<string, string> = { NGN: "₦", GBP: "£", USD: "$", EUR: "€", GHS: "GH₵", KES: "KSh ", ZAR: "R" };

export function formatMoney(amount: number, currency: string): string {
  const code = currency.trim().toUpperCase();
  const symbol = CURRENCY_SYMBOL[code] ?? `${code} `;
  const body = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(amount));
  return `${amount < 0 ? "-" : ""}${symbol}${body}`;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(value);
}

export function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 }).format(value)}%`;
}

export function formatDateCell(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    : value;
}

/** The text a cell shows. Empty cells show a dash. */
export function formatCell(cell: ReportCell | undefined, column: ReportColumn, currency: string): string {
  const value = cellValue(cell);
  if (value == null || value === "") return "—";
  if (typeof value === "string") return column.kind === "date" ? formatDateCell(value) : value;
  switch (cellKind(cell, column)) {
    case "money":
      return formatMoney(value, currency);
    case "percent":
      return formatPercent(value);
    case "number":
      return formatNumber(value);
    case "date":
    case "text":
    default:
      return String(value);
  }
}

/** Turns a document into rows of text, for CSV. Sections are separated by their titles. */
export function documentToRows(doc: ReportDocument): (string | number)[][] {
  const out: (string | number)[][] = [[doc.title], [doc.subtitle], []];
  for (const s of doc.sections) {
    if (s.title) out.push([s.title]);
    if (s.rows.length === 0) {
      out.push([s.emptyMessage ?? "Nothing to show."], []);
      continue;
    }
    out.push(s.columns.map((c) => c.label));
    const plain = (row: Record<string, ReportCell>) => s.columns.map((c) => cellValue(row[c.key]) ?? "");
    for (const r of s.rows) out.push(plain(r));
    if (s.totals) out.push(plain(s.totals));
    out.push([]);
  }
  for (const n of doc.notes) out.push([n]);
  return out;
}
