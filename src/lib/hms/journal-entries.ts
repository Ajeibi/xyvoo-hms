import type { SupabaseClient } from "@supabase/supabase-js";
import { isDebitNormal, type AccountType } from "@/lib/hms/chart-of-accounts";

/** Same cost-centre vocabulary as Procurement's purchase-order form (Kitchen/Bar/Housekeeping/
 * Front Desk/Engineering/Procurement/Other), plus Accounts itself as a valid cost centre. Kept as
 * a local literal here rather than importing Procurement's UI-local const, so this module has no
 * dependency on Procurement's client component. */
export const ACCOUNTS_DEPARTMENTS = [
  "Kitchen",
  "Bar",
  "Housekeeping",
  "Front Desk",
  "Engineering",
  "Procurement",
  "Accounts",
  "Other",
] as const;

export type JournalEntryLineInput = {
  accountId: string;
  department?: string | null;
  description?: string | null;
  debit: number;
  credit: number;
};

export type JournalEntryRow = {
  id: string;
  entryDate: string;
  memo: string;
  reference: string | null;
  reversedOf: string | null;
  reversedBy: string | null;
  total: number;
  createdAt: string;
};

export type JournalEntryLineDetail = JournalEntryLineInput & {
  id: string;
  accountCode: string;
  accountName: string;
};

export type JournalEntryDetail = JournalEntryRow & { lines: JournalEntryLineDetail[] };

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
  /** Signed net balance in the account's own normal-balance direction. */
  balance: number;
};

const ROUNDING_TOLERANCE = 0.01;

function validateLines(lines: JournalEntryLineInput[]): string | null {
  if (lines.length < 2) return "A journal entry needs at least two lines.";
  let totalDebit = 0;
  let totalCredit = 0;
  for (const line of lines) {
    const debit = Number(line.debit) || 0;
    const credit = Number(line.credit) || 0;
    if (debit < 0 || credit < 0) return "Amounts cannot be negative.";
    const hasDebit = debit > 0;
    const hasCredit = credit > 0;
    if (hasDebit === hasCredit) return "Each line must have either a debit or a credit, not both or neither.";
    totalDebit += debit;
    totalCredit += credit;
  }
  if (Math.abs(totalDebit - totalCredit) > ROUNDING_TOLERANCE) {
    return `Entry does not balance — debits ${totalDebit.toFixed(2)} vs credits ${totalCredit.toFixed(2)}.`;
  }
  return null;
}

export async function postJournalEntry(
  service: SupabaseClient,
  params: {
    tenantId: string;
    entryDate: string;
    memo: string;
    reference?: string | null;
    createdBy: string;
    lines: JournalEntryLineInput[];
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!params.memo.trim()) return { ok: false, error: "Memo is required." };
  const validationError = validateLines(params.lines);
  if (validationError) return { ok: false, error: validationError };

  const accountIds = [...new Set(params.lines.map((l) => l.accountId))];
  const { data: accounts } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,is_active")
    .eq("tenant_id", params.tenantId)
    .in("id", accountIds);

  const foundIds = new Set((accounts ?? []).map((a) => a.id as string));
  const missing = accountIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) return { ok: false, error: "One or more accounts were not found." };
  const inactive = (accounts ?? []).filter((a) => !a.is_active).map((a) => a.id as string);
  if (inactive.length > 0) return { ok: false, error: "Cannot post to an inactive account." };

  const { data: entry, error: entryError } = await service
    .schema("hotel")
    .from("journal_entries")
    .insert({
      tenant_id: params.tenantId,
      entry_date: params.entryDate,
      memo: params.memo.trim(),
      reference: params.reference ?? null,
      created_by: params.createdBy,
    })
    .select("id")
    .single();

  if (entryError) return { ok: false, error: entryError.message };
  const entryId = entry.id as string;

  const { error: linesError } = await service
    .schema("hotel")
    .from("journal_entry_lines")
    .insert(
      params.lines.map((line, i) => ({
        tenant_id: params.tenantId,
        journal_entry_id: entryId,
        account_id: line.accountId,
        line_no: i,
        department: line.department ?? null,
        description: line.description ?? null,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
      })),
    );

  if (linesError) {
    await service.schema("hotel").from("journal_entries").delete().eq("id", entryId);
    return { ok: false, error: linesError.message };
  }

  return { ok: true, id: entryId };
}

export async function reverseJournalEntry(
  service: SupabaseClient,
  params: { tenantId: string; journalEntryId: string; actorUserId: string; memo?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const original = await getJournalEntryDetail(service, params.tenantId, params.journalEntryId);
  if (!original) return { ok: false, error: "Entry not found." };
  if (original.reversedBy) return { ok: false, error: "This entry has already been reversed." };

  const result = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: params.memo?.trim() || `Reversal of: ${original.memo}`,
    reference: original.id,
    createdBy: params.actorUserId,
    lines: original.lines.map((l) => ({
      accountId: l.accountId,
      department: l.department,
      description: l.description,
      debit: l.credit,
      credit: l.debit,
    })),
  });

  if (!result.ok) return result;

  await service
    .schema("hotel")
    .from("journal_entries")
    .update({ reversed_of: original.id })
    .eq("id", result.id);
  await service
    .schema("hotel")
    .from("journal_entries")
    .update({ reversed_by: result.id })
    .eq("id", original.id);

  return { ok: true, id: result.id };
}

export async function listJournalEntries(
  service: SupabaseClient,
  tenantId: string,
  opts?: { limit?: number },
): Promise<JournalEntryRow[]> {
  const { data: entries, error } = await service
    .schema("hotel")
    .from("journal_entries")
    .select("id,entry_date,memo,reference,reversed_of,reversed_by,created_at")
    .eq("tenant_id", tenantId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 100);
  if (error) throw new Error(error.message);

  const entryIds = (entries ?? []).map((e) => e.id as string);
  const totalByEntry = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: lines } = await service
      .schema("hotel")
      .from("journal_entry_lines")
      .select("journal_entry_id,debit")
      .eq("tenant_id", tenantId)
      .in("journal_entry_id", entryIds);
    for (const l of lines ?? []) {
      const id = l.journal_entry_id as string;
      totalByEntry.set(id, (totalByEntry.get(id) ?? 0) + (Number(l.debit) || 0));
    }
  }

  return (entries ?? []).map((e) => ({
    id: e.id as string,
    entryDate: e.entry_date as string,
    memo: e.memo as string,
    reference: (e.reference as string | null) ?? null,
    reversedOf: (e.reversed_of as string | null) ?? null,
    reversedBy: (e.reversed_by as string | null) ?? null,
    total: totalByEntry.get(e.id as string) ?? 0,
    createdAt: e.created_at as string,
  }));
}

export async function getJournalEntryDetail(
  service: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<JournalEntryDetail | null> {
  const { data: entry } = await service
    .schema("hotel")
    .from("journal_entries")
    .select("id,entry_date,memo,reference,reversed_of,reversed_by,created_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (!entry) return null;

  const { data: lines } = await service
    .schema("hotel")
    .from("journal_entry_lines")
    .select("id,account_id,department,description,debit,credit,line_no,chart_of_accounts(code,name)")
    .eq("tenant_id", tenantId)
    .eq("journal_entry_id", id)
    .order("line_no", { ascending: true });

  type AccountEmbed = { code: string; name: string } | { code: string; name: string }[] | null;
  const lineRows = (lines ?? []).map((l) => {
    const acct = l.chart_of_accounts as AccountEmbed;
    const a = Array.isArray(acct) ? acct[0] : acct;
    return {
      id: l.id as string,
      accountId: l.account_id as string,
      accountCode: a?.code ?? "",
      accountName: a?.name ?? "",
      department: (l.department as string | null) ?? null,
      description: (l.description as string | null) ?? null,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    };
  });

  const total = lineRows.reduce((sum, l) => sum + l.debit, 0);

  return {
    id: entry.id as string,
    entryDate: entry.entry_date as string,
    memo: entry.memo as string,
    reference: (entry.reference as string | null) ?? null,
    reversedOf: (entry.reversed_of as string | null) ?? null,
    reversedBy: (entry.reversed_by as string | null) ?? null,
    total,
    createdAt: entry.created_at as string,
    lines: lineRows,
  };
}

export async function getTrialBalance(
  service: SupabaseClient,
  tenantId: string,
  opts?: { asOfDate?: string },
): Promise<TrialBalanceRow[]> {
  const accounts = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,code,name,type")
    .eq("tenant_id", tenantId);
  const accountRows = (accounts.data ?? []) as { id: string; code: string; name: string; type: AccountType }[];
  if (accountRows.length === 0) return [];

  let entryIdsFilter: string[] | null = null;
  if (opts?.asOfDate) {
    const { data: entries } = await service
      .schema("hotel")
      .from("journal_entries")
      .select("id")
      .eq("tenant_id", tenantId)
      .lte("entry_date", opts.asOfDate);
    entryIdsFilter = (entries ?? []).map((e) => e.id as string);
    if (entryIdsFilter.length === 0) {
      return accountRows
        .map((a) => ({ accountId: a.id, code: a.code, name: a.name, type: a.type, debit: 0, credit: 0, balance: 0 }))
        .sort((a, b) => a.code.localeCompare(b.code));
    }
  }

  let lineQuery = service
    .schema("hotel")
    .from("journal_entry_lines")
    .select("account_id,debit,credit")
    .eq("tenant_id", tenantId);
  if (entryIdsFilter) lineQuery = lineQuery.in("journal_entry_id", entryIdsFilter);
  const { data: lines } = await lineQuery;

  const debitByAccount = new Map<string, number>();
  const creditByAccount = new Map<string, number>();
  for (const l of lines ?? []) {
    const id = l.account_id as string;
    debitByAccount.set(id, (debitByAccount.get(id) ?? 0) + (Number(l.debit) || 0));
    creditByAccount.set(id, (creditByAccount.get(id) ?? 0) + (Number(l.credit) || 0));
  }

  return accountRows
    .map((a) => {
      const debit = debitByAccount.get(a.id) ?? 0;
      const credit = creditByAccount.get(a.id) ?? 0;
      const balance = isDebitNormal(a.type) ? debit - credit : credit - debit;
      return { accountId: a.id, code: a.code, name: a.name, type: a.type, debit, credit, balance };
    })
    .sort((a, b) => a.code.localeCompare(b.code));
}
