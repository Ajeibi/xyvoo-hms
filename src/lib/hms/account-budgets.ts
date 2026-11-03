import type { SupabaseClient } from "@supabase/supabase-js";
import { getIncomeStatement } from "@/lib/hms/financial-statements";
import { listChartOfAccounts, type AccountType } from "@/lib/hms/chart-of-accounts";
import { addMonths, monthStartOf } from "@/lib/hms/accounting-periods";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A yearly figure spread over `months` months; the last month takes the rounding so the parts add up. */
export function spreadEvenly(total: number, months = 12): number[] {
  if (months < 1) return [];
  const base = round2(total / months);
  const out = Array.from({ length: months - 1 }, () => base);
  out.push(round2(total - base * (months - 1)));
  return out;
}

export type BudgetLine = {
  accountId: string;
  code: string;
  name: string;
  type: "revenue" | "expense";
  actual: number;
  budget: number;
  /** Favourable is positive: revenue above budget, or spending below it. */
  difference: number;
  /** Actual as a share of budget; null when nothing was budgeted. */
  percentOfBudget: number | null;
};

export type BudgetReport = {
  revenueLines: BudgetLine[];
  expenseLines: BudgetLine[];
  totals: {
    revenue: { actual: number; budget: number; difference: number };
    expense: { actual: number; budget: number; difference: number };
    netIncome: { actual: number; budget: number; difference: number };
  };
};

export function makeLine(
  acct: { accountId: string; code: string; name: string; type: "revenue" | "expense" },
  actual: number,
  budget: number,
): BudgetLine {
  const difference = acct.type === "revenue" ? round2(actual - budget) : round2(budget - actual);
  return {
    ...acct,
    actual: round2(actual),
    budget: round2(budget),
    difference,
    percentOfBudget: budget > 0 ? Math.round((actual / budget) * 100) : null,
  };
}

/** Joins actuals and budgets by account. An account with only a budget or only an actual still shows. */
export function buildBudgetReport(
  actuals: { accountId: string; code: string; name: string; type: AccountType; balance: number }[],
  budgets: Map<string, number>,
  accounts: { id: string; code: string; name: string; type: AccountType }[],
): BudgetReport {
  const actualBy = new Map(actuals.map((a) => [a.accountId, a.balance]));
  const lines = accounts
    .filter((a): a is typeof a & { type: "revenue" | "expense" } => a.type === "revenue" || a.type === "expense")
    .map((a) => makeLine({ accountId: a.id, code: a.code, name: a.name, type: a.type }, actualBy.get(a.id) ?? 0, budgets.get(a.id) ?? 0))
    .filter((l) => l.actual !== 0 || l.budget !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  const revenueLines = lines.filter((l) => l.type === "revenue");
  const expenseLines = lines.filter((l) => l.type === "expense");
  const sum = (ls: BudgetLine[], k: "actual" | "budget") => round2(ls.reduce((s, l) => s + l[k], 0));
  const rev = { actual: sum(revenueLines, "actual"), budget: sum(revenueLines, "budget") };
  const exp = { actual: sum(expenseLines, "actual"), budget: sum(expenseLines, "budget") };
  const net = { actual: round2(rev.actual - exp.actual), budget: round2(rev.budget - exp.budget) };
  return {
    revenueLines,
    expenseLines,
    totals: {
      revenue: { ...rev, difference: round2(rev.actual - rev.budget) },
      expense: { ...exp, difference: round2(exp.budget - exp.actual) },
      netIncome: { ...net, difference: round2(net.actual - net.budget) },
    },
  };
}

/** Budget total per account over every month from the month of `dateFrom` to the month of `dateTo`. */
export async function getBudgetReport(
  service: SupabaseClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string },
): Promise<BudgetReport> {
  const [income, accounts, { data }] = await Promise.all([
    getIncomeStatement(service, tenantId, params),
    listChartOfAccounts(service, tenantId),
    service
      .schema("hotel")
      .from("account_budgets")
      .select("account_id,amount")
      .eq("tenant_id", tenantId)
      .gte("period_month", monthStartOf(params.dateFrom))
      .lte("period_month", monthStartOf(params.dateTo)),
  ]);
  const budgets = new Map<string, number>();
  for (const b of data ?? []) budgets.set(b.account_id as string, round2((budgets.get(b.account_id as string) ?? 0) + Number(b.amount)));
  return buildBudgetReport([...income.revenueRows, ...income.expenseRows], budgets, accounts);
}

export type BudgetGridRow = { accountId: string; code: string; name: string; type: "revenue" | "expense"; months: number[] };

/** Every revenue and expense account with its twelve monthly budgets for `year` (0 where none). */
export async function getBudgetGrid(service: SupabaseClient, tenantId: string, year: number): Promise<BudgetGridRow[]> {
  const [accounts, { data }] = await Promise.all([
    listChartOfAccounts(service, tenantId, { activeOnly: true }),
    service
      .schema("hotel")
      .from("account_budgets")
      .select("account_id,period_month,amount")
      .eq("tenant_id", tenantId)
      .gte("period_month", `${year}-01-01`)
      .lte("period_month", `${year}-12-01`),
  ]);
  const byAccount = new Map<string, number[]>();
  for (const b of data ?? []) {
    const arr = byAccount.get(b.account_id as string) ?? Array(12).fill(0);
    arr[Number((b.period_month as string).slice(5, 7)) - 1] = Number(b.amount);
    byAccount.set(b.account_id as string, arr);
  }
  return accounts
    .filter((a): a is typeof a & { type: "revenue" | "expense" } => a.type === "revenue" || a.type === "expense")
    .map((a) => ({ accountId: a.id, code: a.code, name: a.name, type: a.type, months: byAccount.get(a.id) ?? Array(12).fill(0) }));
}

export type BudgetEntry = { accountId: string; month: string; amount: number };

export async function saveBudgets(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; entries: BudgetEntry[] },
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  if (params.entries.length === 0) return { ok: true, saved: 0 };
  const ids = [...new Set(params.entries.map((e) => e.accountId))];
  const { data: accts } = await service.schema("hotel").from("chart_of_accounts").select("id,type").eq("tenant_id", params.tenantId).in("id", ids);
  const ok = new Map((accts ?? []).map((a) => [a.id as string, a.type as string]));
  for (const e of params.entries) {
    const t = ok.get(e.accountId);
    if (!t) return { ok: false, error: "One of the accounts was not found." };
    if (t !== "revenue" && t !== "expense") return { ok: false, error: "Only revenue and expense accounts can be budgeted." };
    if (!(e.amount >= 0)) return { ok: false, error: "A budget cannot be negative." };
  }

  const keep = params.entries.filter((e) => e.amount > 0);
  const drop = params.entries.filter((e) => e.amount === 0);
  if (keep.length > 0) {
    const { error } = await service
      .schema("hotel")
      .from("account_budgets")
      .upsert(
        keep.map((e) => ({
          tenant_id: params.tenantId,
          account_id: e.accountId,
          period_month: e.month,
          amount: round2(e.amount),
          updated_by: params.actorUserId,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "tenant_id,account_id,period_month" },
      );
    if (error) return { ok: false, error: error.message };
  }
  for (const e of drop) {
    await service.schema("hotel").from("account_budgets").delete().eq("tenant_id", params.tenantId).eq("account_id", e.accountId).eq("period_month", e.month);
  }
  return { ok: true, saved: params.entries.length };
}

export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(`${year}-01-01`, i));
}
