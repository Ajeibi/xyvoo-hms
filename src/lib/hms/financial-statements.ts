import type { SupabaseClient } from "@supabase/supabase-js";
import { isDebitNormal, type AccountType } from "@/lib/hms/chart-of-accounts";
import { getTrialBalance, type TrialBalanceRow } from "@/lib/hms/journal-entries";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** One day before a `YYYY-MM-DD` string, computed in UTC so it never shifts across a local
 * timezone's midnight — used to get the closing balance of the day immediately before a period
 * starts (that period's opening balance). */
function dayBefore(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export type IncomeStatementResult = {
  revenueRows: TrialBalanceRow[];
  expenseRows: TrialBalanceRow[];
  totalRevenue: number;
  totalExpense: number;
  netIncome: number;
};

/** Revenue and expense activity for a date range — a period P&L, not cumulative since
 * inception like getTrialBalance's default. Every other statement below builds on this same
 * call rather than re-deriving net income a different way. */
export async function getIncomeStatement(
  service: SupabaseClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string },
): Promise<IncomeStatementResult> {
  const rows = await getTrialBalance(service, tenantId, { dateFrom: params.dateFrom, asOfDate: params.dateTo });
  const revenueRows = rows.filter((r) => r.type === "revenue");
  const expenseRows = rows.filter((r) => r.type === "expense");
  const totalRevenue = round2(revenueRows.reduce((sum, r) => sum + r.balance, 0));
  const totalExpense = round2(expenseRows.reduce((sum, r) => sum + r.balance, 0));
  return { revenueRows, expenseRows, totalRevenue, totalExpense, netIncome: round2(totalRevenue - totalExpense) };
}

export type BalanceSheetResult = {
  assetRows: TrialBalanceRow[];
  liabilityRows: TrialBalanceRow[];
  equityRows: TrialBalanceRow[];
  /** Revenue minus expense since inception, not yet closed to Retained Earnings (there is no
   * period-close yet). Shown as its own Equity line so Assets = Liabilities + Equity always
   * holds — once period-close exists, this must reconcile against whatever posts to Retained
   * Earnings instead of being shown alongside it, or the two would double-count. */
  netIncomeSinceLastClose: number;
  totalAssets: number;
  totalLiabilitiesAndEquity: number;
  balanced: boolean;
};

export async function getBalanceSheet(
  service: SupabaseClient,
  tenantId: string,
  params: { asOfDate: string },
): Promise<BalanceSheetResult> {
  const rows = await getTrialBalance(service, tenantId, { asOfDate: params.asOfDate });
  const assetRows = rows.filter((r) => r.type === "asset");
  const liabilityRows = rows.filter((r) => r.type === "liability");
  const equityRows = rows.filter((r) => r.type === "equity");
  const revenueTotal = rows.filter((r) => r.type === "revenue").reduce((sum, r) => sum + r.balance, 0);
  const expenseTotal = rows.filter((r) => r.type === "expense").reduce((sum, r) => sum + r.balance, 0);
  const netIncomeSinceLastClose = round2(revenueTotal - expenseTotal);

  const totalAssets = round2(assetRows.reduce((sum, r) => sum + r.balance, 0));
  const totalLiabilitiesAndEquity = round2(
    liabilityRows.reduce((sum, r) => sum + r.balance, 0) +
      equityRows.reduce((sum, r) => sum + r.balance, 0) +
      netIncomeSinceLastClose,
  );

  return {
    assetRows,
    liabilityRows,
    equityRows,
    netIncomeSinceLastClose,
    totalAssets,
    totalLiabilitiesAndEquity,
    balanced: Math.abs(totalAssets - totalLiabilitiesAndEquity) <= 0.01,
  };
}

export type CashFlowLineItem = { accountId: string; code: string; name: string; delta: number };

export type CashFlowStatementResult = {
  netIncome: number;
  operatingItems: CashFlowLineItem[];
  investingItems: CashFlowLineItem[];
  financingItems: CashFlowLineItem[];
  operatingTotal: number;
  investingTotal: number;
  financingTotal: number;
  netCashFlow: number;
  beginningCash: number;
  endingCash: number;
  /** False only on a real bug — beginningCash + netCashFlow must equal endingCash by
   * construction, since every account's balance change is reconciled somewhere. */
  reconciles: boolean;
};

/**
 * Indirect method. Net income already captures every revenue/expense movement for the period,
 * so revenue/expense accounts are excluded entirely from the reconciliation loop below — only
 * the period's balance *change* on every other (non-cash-equivalent) account is reconciled,
 * signed per the standard indirect-method convention: an asset increase consumes cash, a
 * liability or equity increase brings cash in.
 */
export async function getCashFlowStatement(
  service: SupabaseClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string },
): Promise<CashFlowStatementResult> {
  const income = await getIncomeStatement(service, tenantId, params);

  const [startRows, endRows] = await Promise.all([
    getTrialBalance(service, tenantId, { asOfDate: dayBefore(params.dateFrom) }),
    getTrialBalance(service, tenantId, { asOfDate: params.dateTo }),
  ]);
  const startByAccount = new Map(startRows.map((r) => [r.accountId, r]));

  const operatingItems: CashFlowLineItem[] = [];
  const investingItems: CashFlowLineItem[] = [];
  const financingItems: CashFlowLineItem[] = [];

  for (const end of endRows) {
    if (end.type === "revenue" || end.type === "expense") continue;
    if (end.isCashEquivalent) continue;

    const startBalance = startByAccount.get(end.accountId)?.balance ?? 0;
    const rawDelta = round2(end.balance - startBalance);
    if (rawDelta === 0) continue;

    const cashImpact = end.type === "asset" ? -rawDelta : rawDelta;
    const item: CashFlowLineItem = { accountId: end.accountId, code: end.code, name: end.name, delta: cashImpact };

    if (end.cashFlowCategory === "investing") investingItems.push(item);
    else if (end.cashFlowCategory === "financing") financingItems.push(item);
    else operatingItems.push(item);
  }

  const operatingTotal = round2(income.netIncome + operatingItems.reduce((sum, i) => sum + i.delta, 0));
  const investingTotal = round2(investingItems.reduce((sum, i) => sum + i.delta, 0));
  const financingTotal = round2(financingItems.reduce((sum, i) => sum + i.delta, 0));
  const netCashFlow = round2(operatingTotal + investingTotal + financingTotal);

  const beginningCash = round2(startRows.filter((r) => r.isCashEquivalent).reduce((sum, r) => sum + r.balance, 0));
  const endingCash = round2(endRows.filter((r) => r.isCashEquivalent).reduce((sum, r) => sum + r.balance, 0));

  return {
    netIncome: income.netIncome,
    operatingItems,
    investingItems,
    financingItems,
    operatingTotal,
    investingTotal,
    financingTotal,
    netCashFlow,
    beginningCash,
    endingCash,
    reconciles: Math.abs(round2(beginningCash + netCashFlow - endingCash)) <= 0.01,
  };
}

export type LedgerLine = {
  id: string;
  journalEntryId: string;
  entryDate: string;
  memo: string;
  reference: string | null;
  reversedOf: string | null;
  reversedBy: string | null;
  department: string | null;
  description: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
};

export type AccountLedgerResult = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  openingBalance: number;
  lines: LedgerLine[];
  closingBalance: number;
};

/** One account's full activity in date order with a running balance — the drill-down the
 * trial balance/statements only ever show a single number for. */
export async function getAccountLedger(
  service: SupabaseClient,
  tenantId: string,
  accountId: string,
  opts?: { dateFrom?: string; dateTo?: string },
): Promise<AccountLedgerResult | null> {
  const { data: account } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,code,name,type")
    .eq("tenant_id", tenantId)
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return null;
  const accountType = account.type as AccountType;

  let openingBalance = 0;
  if (opts?.dateFrom) {
    const priorRows = await getTrialBalance(service, tenantId, { asOfDate: dayBefore(opts.dateFrom) });
    openingBalance = priorRows.find((r) => r.accountId === accountId)?.balance ?? 0;
  }

  let entryQuery = service
    .schema("hotel")
    .from("journal_entries")
    .select("id,entry_date,memo,reference,reversed_of,reversed_by,created_at")
    .eq("tenant_id", tenantId);
  if (opts?.dateFrom) entryQuery = entryQuery.gte("entry_date", opts.dateFrom);
  if (opts?.dateTo) entryQuery = entryQuery.lte("entry_date", opts.dateTo);
  const { data: entries } = await entryQuery.order("entry_date", { ascending: true }).order("created_at", { ascending: true });
  const entryRows = (entries ?? []) as {
    id: string;
    entry_date: string;
    memo: string;
    reference: string | null;
    reversed_of: string | null;
    reversed_by: string | null;
    created_at: string;
  }[];

  if (entryRows.length === 0) {
    return {
      accountId,
      code: account.code as string,
      name: account.name as string,
      type: accountType,
      openingBalance,
      lines: [],
      closingBalance: openingBalance,
    };
  }

  const entryById = new Map(entryRows.map((e) => [e.id, e]));
  const { data: lines } = await service
    .schema("hotel")
    .from("journal_entry_lines")
    .select("id,journal_entry_id,department,description,debit,credit")
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId)
    .in(
      "journal_entry_id",
      entryRows.map((e) => e.id),
    );

  const debitNormal = isDebitNormal(accountType);
  const sorted = (lines ?? [])
    .map((l) => ({ ...l, entry: entryById.get(l.journal_entry_id as string) }))
    .filter((l): l is typeof l & { entry: NonNullable<(typeof l)["entry"]> } => Boolean(l.entry))
    .sort((a, b) => {
      const dateCmp = a.entry.entry_date.localeCompare(b.entry.entry_date);
      return dateCmp !== 0 ? dateCmp : a.entry.created_at.localeCompare(b.entry.created_at);
    });

  let running = openingBalance;
  const ledgerLines: LedgerLine[] = sorted.map((l) => {
    const debit = Number(l.debit) || 0;
    const credit = Number(l.credit) || 0;
    running = round2(running + (debitNormal ? debit - credit : credit - debit));
    return {
      id: l.id as string,
      journalEntryId: l.journal_entry_id as string,
      entryDate: l.entry.entry_date,
      memo: l.entry.memo,
      reference: l.entry.reference,
      reversedOf: l.entry.reversed_of,
      reversedBy: l.entry.reversed_by,
      department: (l.department as string | null) ?? null,
      description: (l.description as string | null) ?? null,
      debit,
      credit,
      runningBalance: running,
    };
  });

  return {
    accountId,
    code: account.code as string,
    name: account.name as string,
    type: accountType,
    openingBalance,
    lines: ledgerLines,
    closingBalance: ledgerLines.length > 0 ? ledgerLines[ledgerLines.length - 1].runningBalance : openingBalance,
  };
}
