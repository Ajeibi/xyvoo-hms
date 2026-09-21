import type { SupabaseClient } from "@supabase/supabase-js";
import { isDebitNormal } from "@/lib/hms/chart-of-accounts";
import { getTrialBalance } from "@/lib/hms/journal-entries";
import type { BankStatementRow } from "@/lib/hms/bank-statement-import";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** UTC-safe date-string arithmetic — never local-timezone `Date` math on a date-only string,
 * matching the convention established in financial-statements.ts. */
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type BankReconciliationStatus = "in_progress" | "completed";

export type BankReconciliationRow = {
  id: string;
  accountId: string;
  periodEndDate: string;
  statementEndingBalance: number;
  status: BankReconciliationStatus;
  finalDifference: number | null;
  createdBy: string;
  completedBy: string | null;
  completedAt: string | null;
  createdAt: string;
};

function mapReconciliationRow(r: Record<string, unknown>): BankReconciliationRow {
  return {
    id: r.id as string,
    accountId: r.account_id as string,
    periodEndDate: r.period_end_date as string,
    statementEndingBalance: Number(r.statement_ending_balance) || 0,
    status: r.status as BankReconciliationStatus,
    finalDifference: r.final_difference != null ? Number(r.final_difference) : null,
    createdBy: r.created_by as string,
    completedBy: (r.completed_by as string | null) ?? null,
    completedAt: (r.completed_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

const RECONCILIATION_COLUMNS =
  "id,account_id,period_end_date,statement_ending_balance,status,final_difference,created_by,completed_by,completed_at,created_at";

export async function createBankReconciliation(
  service: SupabaseClient,
  params: { tenantId: string; accountId: string; periodEndDate: string; statementEndingBalance: number; createdBy: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data: account } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,is_cash_equivalent")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.accountId)
    .maybeSingle();
  if (!account) return { ok: false, error: "Account not found." };
  if (!account.is_cash_equivalent) return { ok: false, error: "Only bank/cash accounts can be reconciled." };

  const { data, error } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .insert({
      tenant_id: params.tenantId,
      account_id: params.accountId,
      period_end_date: params.periodEndDate,
      statement_ending_balance: round2(params.statementEndingBalance),
      created_by: params.createdBy,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}

export async function listBankReconciliations(
  service: SupabaseClient,
  tenantId: string,
  accountId: string,
): Promise<BankReconciliationRow[]> {
  const { data } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .select(RECONCILIATION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .order("period_end_date", { ascending: false });
  return (data ?? []).map(mapReconciliationRow);
}

/** De-dupes against existing lines in this same reconciliation on (date, amount, description)
 * before inserting, so re-uploading an overlapping statement doesn't double every line. */
export async function importStatementLines(
  service: SupabaseClient,
  params: { tenantId: string; reconciliationId: string; rows: BankStatementRow[] },
): Promise<{ ok: true; inserted: number; duplicates: number } | { ok: false; error: string }> {
  if (params.rows.length === 0) return { ok: true, inserted: 0, duplicates: 0 };

  const { data: existing } = await service
    .schema("hotel")
    .from("bank_reconciliation_lines")
    .select("line_date,amount,description")
    .eq("tenant_id", params.tenantId)
    .eq("reconciliation_id", params.reconciliationId);

  const existingKeys = new Set((existing ?? []).map((l) => `${l.line_date}|${l.amount}|${l.description}`));
  const toInsert = params.rows.filter((r) => !existingKeys.has(`${r.lineDate}|${r.amount}|${r.description}`));
  const duplicates = params.rows.length - toInsert.length;
  if (toInsert.length === 0) return { ok: true, inserted: 0, duplicates };

  const { error } = await service
    .schema("hotel")
    .from("bank_reconciliation_lines")
    .insert(
      toInsert.map((r) => ({
        tenant_id: params.tenantId,
        reconciliation_id: params.reconciliationId,
        line_date: r.lineDate,
        description: r.description,
        amount: r.amount,
        reference: r.reference,
      })),
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true, inserted: toInsert.length, duplicates };
}

export async function addManualStatementLine(
  service: SupabaseClient,
  params: { tenantId: string; reconciliationId: string; lineDate: string; description: string; amount: number; reference?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await importStatementLines(service, {
    tenantId: params.tenantId,
    reconciliationId: params.reconciliationId,
    rows: [
      {
        lineDate: params.lineDate,
        description: params.description,
        amount: round2(params.amount),
        reference: params.reference ?? null,
      },
    ],
  });
  if (!result.ok) return result;
  if (result.inserted === 0) return { ok: false, error: "An identical line already exists on this reconciliation." };
  return { ok: true };
}

export type BankReconciliationLineRow = {
  id: string;
  reconciliationId: string;
  lineDate: string;
  description: string;
  amount: number;
  reference: string | null;
  matchedJournalEntryLineIds: string[];
};

export type UnmatchedJournalLine = {
  id: string;
  entryDate: string;
  memo: string;
  department: string | null;
  debit: number;
  credit: number;
};

export type BankReconciliationDetail = {
  reconciliation: BankReconciliationRow;
  lines: BankReconciliationLineRow[];
  unmatchedJournalLines: UnmatchedJournalLine[];
  bookBalance: number;
  clearedBookBalance: number;
  difference: number;
  balanced: boolean;
};

type JournalEntryEmbed = { entry_date: string; memo: string } | { entry_date: string; memo: string }[] | null;

export async function getBankReconciliation(
  service: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<BankReconciliationDetail | null> {
  const { data: reconRow } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .select(RECONCILIATION_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!reconRow) return null;
  const reconciliation = mapReconciliationRow(reconRow);

  const { data: lineRows } = await service
    .schema("hotel")
    .from("bank_reconciliation_lines")
    .select("id,line_date,description,amount,reference")
    .eq("tenant_id", tenantId)
    .eq("reconciliation_id", id)
    .order("line_date", { ascending: true });
  const rawLines = (lineRows ?? []) as { id: string; line_date: string; description: string; amount: number; reference: string | null }[];

  const lineIds = rawLines.map((l) => l.id);
  const matchesByLine = new Map<string, string[]>();
  if (lineIds.length > 0) {
    const { data: matches } = await service
      .schema("hotel")
      .from("bank_reconciliation_matches")
      .select("reconciliation_line_id,journal_entry_line_id")
      .eq("tenant_id", tenantId)
      .in("reconciliation_line_id", lineIds);
    for (const m of matches ?? []) {
      const key = m.reconciliation_line_id as string;
      matchesByLine.set(key, [...(matchesByLine.get(key) ?? []), m.journal_entry_line_id as string]);
    }
  }

  const lines: BankReconciliationLineRow[] = rawLines.map((l) => ({
    id: l.id,
    reconciliationId: id,
    lineDate: l.line_date,
    description: l.description,
    amount: Number(l.amount) || 0,
    reference: l.reference,
    matchedJournalEntryLineIds: matchesByLine.get(l.id) ?? [],
  }));

  const trialBalance = await getTrialBalance(service, tenantId, { asOfDate: reconciliation.periodEndDate });
  const accountRow = trialBalance.find((r) => r.accountId === reconciliation.accountId);
  const bookBalance = accountRow?.balance ?? 0;
  const debitNormal = isDebitNormal(accountRow?.type ?? "asset");

  const { data: journalLines } = await service
    .schema("hotel")
    .from("journal_entry_lines")
    .select("id,debit,credit,department,journal_entries!inner(entry_date,memo)")
    .eq("tenant_id", tenantId)
    .eq("account_id", reconciliation.accountId)
    .lte("journal_entries.entry_date", reconciliation.periodEndDate);

  const { data: allMatchedIdsData } = await service
    .schema("hotel")
    .from("bank_reconciliation_matches")
    .select("journal_entry_line_id")
    .eq("tenant_id", tenantId);
  const allMatchedIds = new Set((allMatchedIdsData ?? []).map((m) => m.journal_entry_line_id as string));

  const unmatchedJournalLines: UnmatchedJournalLine[] = [];
  let unmatchedContribution = 0;
  for (const jl of (journalLines ?? []) as { id: string; debit: number; credit: number; department: string | null; journal_entries: JournalEntryEmbed }[]) {
    if (allMatchedIds.has(jl.id)) continue;
    const entry = Array.isArray(jl.journal_entries) ? jl.journal_entries[0] : jl.journal_entries;
    const debit = Number(jl.debit) || 0;
    const credit = Number(jl.credit) || 0;
    unmatchedContribution += debitNormal ? debit - credit : credit - debit;
    unmatchedJournalLines.push({
      id: jl.id,
      entryDate: entry?.entry_date ?? "",
      memo: entry?.memo ?? "",
      department: jl.department,
      debit,
      credit,
    });
  }

  const clearedBookBalance = round2(bookBalance - unmatchedContribution);
  const difference = round2(reconciliation.statementEndingBalance - clearedBookBalance);

  return {
    reconciliation,
    lines,
    unmatchedJournalLines,
    bookBalance,
    clearedBookBalance,
    difference,
    balanced: Math.abs(difference) <= 0.01,
  };
}

export type SuggestedMatch = {
  journalEntryLineId: string;
  entryDate: string;
  memo: string;
  debit: number;
  credit: number;
  /** Same date and same signed amount as the statement line — safe to pre-select. */
  exact: boolean;
};

export async function getSuggestedMatches(
  service: SupabaseClient,
  tenantId: string,
  reconciliationLineId: string,
  opts?: { windowDays?: number },
): Promise<{ ok: true; candidates: SuggestedMatch[] } | { ok: false; error: string }> {
  const windowDays = opts?.windowDays ?? 30;

  const { data: line } = await service
    .schema("hotel")
    .from("bank_reconciliation_lines")
    .select("id,reconciliation_id,line_date,amount")
    .eq("tenant_id", tenantId)
    .eq("id", reconciliationLineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Statement line not found." };

  const { data: recon } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .select("account_id")
    .eq("tenant_id", tenantId)
    .eq("id", line.reconciliation_id)
    .maybeSingle();
  if (!recon) return { ok: false, error: "Reconciliation not found." };

  const { data: journalLines } = await service
    .schema("hotel")
    .from("journal_entry_lines")
    .select("id,debit,credit,journal_entries!inner(entry_date,memo)")
    .eq("tenant_id", tenantId)
    .eq("account_id", recon.account_id)
    .gte("journal_entries.entry_date", addDays(line.line_date, -windowDays))
    .lte("journal_entries.entry_date", addDays(line.line_date, windowDays));

  const { data: matchedIdsData } = await service
    .schema("hotel")
    .from("bank_reconciliation_matches")
    .select("journal_entry_line_id")
    .eq("tenant_id", tenantId);
  const matchedIds = new Set((matchedIdsData ?? []).map((m) => m.journal_entry_line_id as string));

  const candidates: SuggestedMatch[] = [];
  for (const jl of (journalLines ?? []) as { id: string; debit: number; credit: number; journal_entries: JournalEntryEmbed }[]) {
    if (matchedIds.has(jl.id)) continue;
    const entry = Array.isArray(jl.journal_entries) ? jl.journal_entries[0] : jl.journal_entries;
    if (!entry) continue;
    const debit = Number(jl.debit) || 0;
    const credit = Number(jl.credit) || 0;
    // Bank postings are signed by position, not by account type: a deposit debits the (asset)
    // bank account, a withdrawal credits it — this matches the statement's own positive/negative
    // convention directly and must NOT be derived from isDebitNormal (see design-review note).
    const signedAmount = round2(debit - credit);
    const exact = entry.entry_date === line.line_date && Math.abs(signedAmount - Number(line.amount)) <= 0.01;
    candidates.push({ journalEntryLineId: jl.id, entryDate: entry.entry_date, memo: entry.memo, debit, credit, exact });
  }

  candidates.sort((a, b) => (a.exact !== b.exact ? (a.exact ? -1 : 1) : a.entryDate.localeCompare(b.entryDate)));
  return { ok: true, candidates };
}

export async function matchStatementLine(
  service: SupabaseClient,
  tenantId: string,
  params: { reconciliationLineId: string; journalEntryLineIds: string[]; matchedBy: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.journalEntryLineIds.length === 0) return { ok: false, error: "Select at least one transaction to match." };

  const { data: line } = await service
    .schema("hotel")
    .from("bank_reconciliation_lines")
    .select("id,amount,reconciliation_id")
    .eq("tenant_id", tenantId)
    .eq("id", params.reconciliationLineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Statement line not found." };

  const { data: recon } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("id", line.reconciliation_id)
    .maybeSingle();
  if (recon?.status === "completed") return { ok: false, error: "This reconciliation is completed — reopen it first." };

  const { data: journalLines } = await service
    .schema("hotel")
    .from("journal_entry_lines")
    .select("id,debit,credit")
    .eq("tenant_id", tenantId)
    .in("id", params.journalEntryLineIds);
  const rows = (journalLines ?? []) as { id: string; debit: number; credit: number }[];
  if (rows.length !== params.journalEntryLineIds.length) {
    return { ok: false, error: "One or more selected transactions were not found." };
  }

  const selectedSum = round2(rows.reduce((sum, r) => sum + ((Number(r.debit) || 0) - (Number(r.credit) || 0)), 0));
  if (Math.abs(selectedSum - Number(line.amount)) > 0.01) {
    return {
      ok: false,
      error: `Selected transactions total ${selectedSum.toFixed(2)}, which doesn't match this statement line's ${Number(line.amount).toFixed(2)}.`,
    };
  }

  const { error } = await service
    .schema("hotel")
    .from("bank_reconciliation_matches")
    .insert(
      params.journalEntryLineIds.map((jlId) => ({
        tenant_id: tenantId,
        reconciliation_line_id: params.reconciliationLineId,
        journal_entry_line_id: jlId,
        matched_by: params.matchedBy,
      })),
    );
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "One or more of these transactions were already matched elsewhere — refresh and try again." };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function unmatchLine(
  service: SupabaseClient,
  tenantId: string,
  reconciliationLineId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: line } = await service
    .schema("hotel")
    .from("bank_reconciliation_lines")
    .select("id,reconciliation_id")
    .eq("tenant_id", tenantId)
    .eq("id", reconciliationLineId)
    .maybeSingle();
  if (!line) return { ok: false, error: "Statement line not found." };

  const { data: recon } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .select("status")
    .eq("tenant_id", tenantId)
    .eq("id", line.reconciliation_id)
    .maybeSingle();
  if (recon?.status === "completed") return { ok: false, error: "This reconciliation is completed — reopen it first." };

  const { error } = await service
    .schema("hotel")
    .from("bank_reconciliation_matches")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("reconciliation_line_id", reconciliationLineId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reopenBankReconciliation(
  service: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data, error } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .update({ status: "in_progress", final_difference: null, completed_by: null, completed_at: null })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("status", "completed")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Reconciliation not found, or it isn't completed." };
  return { ok: true };
}

export async function completeBankReconciliation(
  service: SupabaseClient,
  tenantId: string,
  params: { id: string; confirmImbalance?: boolean; completedBy: string },
): Promise<{ ok: true; difference: number } | { ok: false; error: string; difference?: number }> {
  const detail = await getBankReconciliation(service, tenantId, params.id);
  if (!detail) return { ok: false, error: "Reconciliation not found." };
  if (detail.reconciliation.status === "completed") return { ok: false, error: "Already completed." };

  if (!detail.balanced && !params.confirmImbalance) {
    return {
      ok: false,
      error: `Out of balance by ${detail.difference.toFixed(2)} — confirm to complete anyway.`,
      difference: detail.difference,
    };
  }

  const { error } = await service
    .schema("hotel")
    .from("bank_reconciliations")
    .update({
      status: "completed",
      final_difference: detail.difference,
      completed_by: params.completedBy,
      completed_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", params.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, difference: detail.difference };
}
