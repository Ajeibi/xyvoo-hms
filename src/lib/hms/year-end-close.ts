import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { getTrialBalance, postJournalEntry, type JournalEntryLineInput, type TrialBalanceRow } from "@/lib/hms/journal-entries";
import { monthsBetween, listPeriods, setPeriodClosed, setPeriodReopened } from "@/lib/hms/accounting-periods";

const RETAINED_EARNINGS_CODE = "3100";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type YearEndPreview = {
  year: number;
  revenueTotal: number;
  expenseTotal: number;
  netIncome: number;
  accountCount: number;
  /** Months of the year not yet closed; the close locks them all. */
  monthsToLock: string[];
};

export type YearEndRow = {
  year: number;
  closed: boolean;
  netIncome: number | null;
  closedAt: string | null;
};

/**
 * One line per revenue or expense account with a balance, each pushed back to zero, and one
 * line to Retained Earnings for the difference. The lines always balance: the account lines
 * net to (revenue - expense) and Retained Earnings takes the opposite side of that amount.
 */
export function buildClosingLines(
  rows: Pick<TrialBalanceRow, "accountId" | "type" | "balance">[],
  retainedEarningsId: string,
): { lines: JournalEntryLineInput[]; revenueTotal: number; expenseTotal: number; netIncome: number } {
  const lines: JournalEntryLineInput[] = [];
  let revenueTotal = 0;
  let expenseTotal = 0;
  for (const r of rows) {
    const b = round2(r.balance);
    if (b === 0) continue;
    if (r.type === "revenue") {
      revenueTotal += b;
      // A revenue balance is credit-normal: debit it to clear it (credit if it was a net debit).
      lines.push(b > 0 ? { accountId: r.accountId, debit: b, credit: 0 } : { accountId: r.accountId, debit: 0, credit: -b });
    } else if (r.type === "expense") {
      expenseTotal += b;
      lines.push(b > 0 ? { accountId: r.accountId, debit: 0, credit: b } : { accountId: r.accountId, debit: -b, credit: 0 });
    }
  }
  revenueTotal = round2(revenueTotal);
  expenseTotal = round2(expenseTotal);
  const netIncome = round2(revenueTotal - expenseTotal);
  if (netIncome > 0) lines.push({ accountId: retainedEarningsId, debit: 0, credit: netIncome });
  else if (netIncome < 0) lines.push({ accountId: retainedEarningsId, debit: -netIncome, credit: 0 });
  return { lines, revenueTotal, expenseTotal, netIncome };
}

/** Swaps every debit and credit, for undoing a closing entry. */
export function flipLines(lines: JournalEntryLineInput[]): JournalEntryLineInput[] {
  return lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
}

export function canCloseYear(year: number, today: string): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(year) || year < 2000 || year > 2200) return { ok: false, error: "Pick a year." };
  if (`${year}-12-31` >= today) return { ok: false, error: "That year has not finished yet, so it cannot be closed." };
  return { ok: true };
}

async function yearRows(service: SupabaseClient, tenantId: string, year: number) {
  const rows = await getTrialBalance(service, tenantId, {
    dateFrom: `${year}-01-01`,
    asOfDate: `${year}-12-31`,
    excludeClosing: true,
  });
  return rows.filter((r) => r.type === "revenue" || r.type === "expense");
}

export async function listYearEnds(service: SupabaseClient, tenantId: string, today: string): Promise<YearEndRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("year_end_closes")
    .select("fiscal_year,net_income,closed_at")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  const closed = new Map((data ?? []).map((r) => [r.fiscal_year as number, r]));
  const thisYear = Number(today.slice(0, 4));
  const out: YearEndRow[] = [];
  for (let y = thisYear - 1; y >= thisYear - 5; y--) {
    const c = closed.get(y);
    out.push({
      year: y,
      closed: !!c,
      netIncome: c ? Number(c.net_income) : null,
      closedAt: c ? (c.closed_at as string) : null,
    });
  }
  return out;
}

export async function getYearEndPreview(
  service: SupabaseClient,
  tenantId: string,
  year: number,
): Promise<YearEndPreview> {
  const [rows, periods] = await Promise.all([yearRows(service, tenantId, year), listPeriods(service, tenantId)]);
  const closedMonths = new Set(periods.filter((p) => p.status === "closed").map((p) => p.month));
  const { lines, revenueTotal, expenseTotal, netIncome } = buildClosingLines(rows, "preview");
  return {
    year,
    revenueTotal,
    expenseTotal,
    netIncome,
    accountCount: lines.length - (netIncome === 0 ? 0 : 1),
    monthsToLock: monthsBetween(`${year}-01-01`, `${year}-12-01`).filter((m) => !closedMonths.has(m)),
  };
}

export async function closeYear(
  service: SupabaseClient,
  params: { tenantId: string; year: number; actorUserId: string; today: string },
): Promise<{ ok: true; journalEntryId: string; netIncome: number } | { ok: false; error: string }> {
  const can = canCloseYear(params.year, params.today);
  if (!can.ok) return can;

  const { data: existing } = await service
    .schema("hotel")
    .from("year_end_closes")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("fiscal_year", params.year)
    .maybeSingle();
  if (existing) return { ok: false, error: `${params.year} is already closed.` };

  const periods = await listPeriods(service, params.tenantId);
  if (periods.some((p) => p.month === `${params.year}-12-01` && p.status === "closed")) {
    return { ok: false, error: `December ${params.year} is already locked. Ask the owner to reopen it first, so the closing entry can be posted.` };
  }

  const retainedEarningsId = await getAccountIdByCode(service, params.tenantId, RETAINED_EARNINGS_CODE);
  if (!retainedEarningsId) return { ok: false, error: "Retained Earnings (3100) is missing from the chart of accounts." };

  const { lines, netIncome } = buildClosingLines(await yearRows(service, params.tenantId, params.year), retainedEarningsId);
  if (lines.length === 0) return { ok: false, error: `Nothing was earned or spent in ${params.year}, so there is nothing to close.` };

  const posted = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: `${params.year}-12-31`,
    memo: `Year-end close ${params.year}: profit to Retained Earnings`,
    reference: `year-end-${params.year}`,
    createdBy: params.actorUserId,
    lines,
    closingYear: params.year,
  });
  if (!posted.ok) return posted;

  const { error } = await service.schema("hotel").from("year_end_closes").insert({
    tenant_id: params.tenantId,
    fiscal_year: params.year,
    journal_entry_id: posted.id,
    net_income: netIncome,
    closed_by: params.actorUserId,
  });
  if (error) return { ok: false, error: error.message };

  // Lock every month of the year, December last so the closing entry could be posted into it.
  const closedMonths = new Set(periods.filter((p) => p.status === "closed").map((p) => p.month));
  for (const month of monthsBetween(`${params.year}-01-01`, `${params.year}-12-01`)) {
    if (closedMonths.has(month)) continue;
    const r = await setPeriodClosed(service, { tenantId: params.tenantId, month, actorUserId: params.actorUserId, today: params.today });
    if (!r.ok) return { ok: false, error: `Closing entry posted, but ${month} could not be locked: ${r.error}` };
  }
  return { ok: true, journalEntryId: posted.id, netIncome };
}

/** Owner's undo: reopens December, posts the mirror-image entry, and frees the year to be closed again. */
export async function undoYearClose(
  service: SupabaseClient,
  params: { tenantId: string; year: number; actorUserId: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = params.reason.trim();
  if (!reason) return { ok: false, error: "Say why the year-end close is being undone." };

  const { data: row } = await service
    .schema("hotel")
    .from("year_end_closes")
    .select("id,journal_entry_id")
    .eq("tenant_id", params.tenantId)
    .eq("fiscal_year", params.year)
    .maybeSingle();
  if (!row?.journal_entry_id) return { ok: false, error: `${params.year} is not closed.` };

  const { data: later } = await service
    .schema("hotel")
    .from("year_end_closes")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .gt("fiscal_year", params.year)
    .limit(1);
  if ((later ?? []).length > 0) return { ok: false, error: "A later year is closed. Undo that one first." };

  const { data: lineRows } = await service
    .schema("hotel")
    .from("journal_entry_lines")
    .select("account_id,debit,credit")
    .eq("tenant_id", params.tenantId)
    .eq("journal_entry_id", row.journal_entry_id as string)
    .order("line_no", { ascending: true });
  const original: JournalEntryLineInput[] = (lineRows ?? []).map((l) => ({
    accountId: l.account_id as string,
    debit: Number(l.debit),
    credit: Number(l.credit),
  }));

  const december = `${params.year}-12-01`;
  const periods = await listPeriods(service, params.tenantId);
  if (periods.some((p) => p.month === december && p.status === "closed")) {
    const r = await setPeriodReopened(service, {
      tenantId: params.tenantId,
      month: december,
      actorUserId: params.actorUserId,
      reason: `Undo year-end close ${params.year}: ${reason}`,
    });
    if (!r.ok) return r;
  }

  const posted = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: `${params.year}-12-31`,
    memo: `Undo year-end close ${params.year}: ${reason}`,
    reference: row.journal_entry_id as string,
    createdBy: params.actorUserId,
    lines: flipLines(original),
    closingYear: params.year,
  });
  if (!posted.ok) return posted;

  await service.schema("hotel").from("journal_entries").update({ reversed_by: posted.id }).eq("id", row.journal_entry_id as string);
  await service.schema("hotel").from("journal_entries").update({ reversed_of: row.journal_entry_id as string }).eq("id", posted.id);
  const { error } = await service.schema("hotel").from("year_end_closes").delete().eq("id", row.id as string);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
