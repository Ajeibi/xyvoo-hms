import Papa from "papaparse";

/** Every parsed row is normalized to this one shape regardless of which header names or
 * column layout the source bank export used — everything downstream (de-dup, insert, matching)
 * only ever deals with this convention: amount positive = money in (deposit), negative = money
 * out (withdrawal). */
export type BankStatementRow = {
  lineDate: string;
  description: string;
  amount: number;
  reference: string | null;
};

export type BankStatementRowIssue = { row: number; reason: string };

export type ParsedBankStatement = {
  rows: BankStatementRow[];
  skipped: BankStatementRowIssue[];
};

const DATE_KEYS = ["date", "transaction_date", "posted_date", "trans_date"];
const DESCRIPTION_KEYS = ["description", "memo", "narrative", "details", "payee"];
const AMOUNT_KEYS = ["amount", "transaction_amount"];
const DEBIT_KEYS = ["debit", "withdrawal", "money_out", "amount_debit"];
const CREDIT_KEYS = ["credit", "deposit", "money_in", "amount_credit"];
const REFERENCE_KEYS = ["reference", "ref", "check_number", "cheque_number"];

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

function findValue(row: Record<string, unknown>, keys: string[]): string | undefined {
  const normalizedRow: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) normalizedRow[normalizeKey(k)] = v;
  for (const key of keys) {
    const v = normalizedRow[key];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

function parseAmount(value: string | undefined): number | undefined {
  if (value == null) return undefined;
  // Strip thousands separators and currency symbols some exports include (e.g. "$1,234.56").
  const cleaned = value.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-") return undefined;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  // Accept YYYY-MM-DD as-is; otherwise let Date parse common bank export formats
  // (MM/DD/YYYY, DD/MM/YYYY ambiguity is a known limitation — flagged in the plan).
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/** Combines whichever amount columns are present into the one deposit-positive/withdrawal-
 * negative convention every reconciliation function assumes. */
function resolveSignedAmount(row: Record<string, unknown>): number | undefined {
  const amount = parseAmount(findValue(row, AMOUNT_KEYS));
  if (amount !== undefined) return amount;

  const debit = parseAmount(findValue(row, DEBIT_KEYS));
  const credit = parseAmount(findValue(row, CREDIT_KEYS));
  if (debit === undefined && credit === undefined) return undefined;
  return (credit ?? 0) - Math.abs(debit ?? 0);
}

function describeRowIssue(row: Record<string, unknown>): string | null {
  if (parseDate(findValue(row, DATE_KEYS)) === undefined) return "Missing or unreadable date.";
  if (resolveSignedAmount(row) === undefined) return "Missing or unreadable amount.";
  return null;
}

function mapRow(row: Record<string, unknown>): BankStatementRow {
  return {
    lineDate: parseDate(findValue(row, DATE_KEYS))!,
    description: findValue(row, DESCRIPTION_KEYS) ?? "(no description)",
    amount: Math.round((resolveSignedAmount(row) ?? 0) * 100) / 100,
    reference: findValue(row, REFERENCE_KEYS) ?? null,
  };
}

/** Pure function — no I/O — so it's testable without an uploaded file or a running server.
 * The route only needs to read the File into text and hand it here. */
export function parseBankStatementCsv(text: string): ParsedBankStatement {
  const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });

  const rows: BankStatementRow[] = [];
  const skipped: BankStatementRowIssue[] = [];

  parsed.data.forEach((data, index) => {
    // Papa's row 0 is the first data row; spreadsheets are 1-indexed with a header row, so the
    // row a user sees in their own file is this index + 2 (mirrors product-import.ts).
    const rowNumber = index + 2;
    const issue = describeRowIssue(data);
    if (issue) {
      skipped.push({ row: rowNumber, reason: issue });
    } else {
      rows.push(mapRow(data));
    }
  });

  return { rows, skipped };
}
