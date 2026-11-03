import type { SupabaseClient } from "@supabase/supabase-js";
import type { AccountType } from "@/lib/hms/chart-of-accounts";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** USALI groups: operated departments earn revenue and carry their own direct costs; everything
 * else is undistributed (administration, utilities, maintenance, depreciation, other income). */
export const PNL_DEPARTMENTS = ["rooms", "fb", "other", "undistributed"] as const;
export type PnlDepartment = (typeof PNL_DEPARTMENTS)[number];

export const PNL_DEPARTMENT_LABELS: Record<PnlDepartment, string> = {
  rooms: "Rooms",
  fb: "Food & beverage",
  other: "Other operated departments",
  undistributed: "Undistributed and other income",
};

const REVENUE_ACCOUNT_DEPARTMENT: Record<string, PnlDepartment> = { "4000": "rooms", "4100": "fb", "4200": "other" };
const EXPENSE_TAG_DEPARTMENT: Record<string, PnlDepartment> = {
  "front desk": "rooms",
  housekeeping: "rooms",
  rooms: "rooms",
  reservations: "rooms",
  kitchen: "fb",
  bar: "fb",
  "food & beverage": "fb",
  restaurant: "fb",
  spa: "other",
  laundry: "other",
};
/** Cost of goods sold is food and drink cost unless a line says otherwise. */
const EXPENSE_ACCOUNT_DEPARTMENT: Record<string, PnlDepartment> = { "5000": "fb" };

export type PnlLine = {
  accountCode: string;
  accountName: string;
  type: AccountType;
  department: string | null;
  debit: number;
  credit: number;
};

/** Revenue follows its account; an expense follows the department tag on its line, then its account. */
export function departmentFor(line: Pick<PnlLine, "accountCode" | "type" | "department">): PnlDepartment {
  if (line.type === "revenue") return REVENUE_ACCOUNT_DEPARTMENT[line.accountCode] ?? "undistributed";
  const tag = (line.department ?? "").trim().toLowerCase();
  return EXPENSE_TAG_DEPARTMENT[tag] ?? EXPENSE_ACCOUNT_DEPARTMENT[line.accountCode] ?? "undistributed";
}

export type PnlAccountRow = { code: string; name: string; amount: number };
export type PnlDepartmentResult = {
  department: PnlDepartment;
  label: string;
  revenue: number;
  costs: number;
  profit: number;
  /** Profit as a share of revenue; null with no revenue. */
  margin: number | null;
  revenueRows: PnlAccountRow[];
  costRows: PnlAccountRow[];
};
export type DepartmentPnl = {
  departments: PnlDepartmentResult[];
  totalRevenue: number;
  totalCosts: number;
  netIncome: number;
};

export function buildDepartmentPnl(lines: PnlLine[]): DepartmentPnl {
  const buckets = new Map<PnlDepartment, { revenue: Map<string, PnlAccountRow>; cost: Map<string, PnlAccountRow> }>();
  for (const d of PNL_DEPARTMENTS) buckets.set(d, { revenue: new Map(), cost: new Map() });

  for (const l of lines) {
    if (l.type !== "revenue" && l.type !== "expense") continue;
    const dept = buckets.get(departmentFor(l))!;
    const side = l.type === "revenue" ? dept.revenue : dept.cost;
    const amount = l.type === "revenue" ? l.credit - l.debit : l.debit - l.credit;
    const row = side.get(l.accountCode) ?? { code: l.accountCode, name: l.accountName, amount: 0 };
    row.amount += amount;
    side.set(l.accountCode, row);
  }

  const departments = PNL_DEPARTMENTS.map((d) => {
    const b = buckets.get(d)!;
    const rows = (m: Map<string, PnlAccountRow>) =>
      [...m.values()].map((r) => ({ ...r, amount: round2(r.amount) })).filter((r) => r.amount !== 0).sort((a, b) => a.code.localeCompare(b.code));
    const revenueRows = rows(b.revenue);
    const costRows = rows(b.cost);
    const revenue = round2(revenueRows.reduce((s, r) => s + r.amount, 0));
    const costs = round2(costRows.reduce((s, r) => s + r.amount, 0));
    return {
      department: d,
      label: PNL_DEPARTMENT_LABELS[d],
      revenue,
      costs,
      profit: round2(revenue - costs),
      margin: revenue > 0 ? Math.round(((revenue - costs) / revenue) * 1000) / 10 : null,
      revenueRows,
      costRows,
    };
  });

  const totalRevenue = round2(departments.reduce((s, d) => s + d.revenue, 0));
  const totalCosts = round2(departments.reduce((s, d) => s + d.costs, 0));
  return { departments, totalRevenue, totalCosts, netIncome: round2(totalRevenue - totalCosts) };
}

type Raw = {
  debit: number;
  credit: number;
  department: string | null;
  chart_of_accounts: { code: string; name: string; type: AccountType } | { code: string; name: string; type: AccountType }[] | null;
};

export async function getDepartmentPnl(
  service: SupabaseClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string },
): Promise<DepartmentPnl> {
  const lines: PnlLine[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .schema("hotel")
      .from("journal_entry_lines")
      .select("debit,credit,department,chart_of_accounts!inner(code,name,type),journal_entries!inner(entry_date,closing_year)")
      .eq("tenant_id", tenantId)
      .in("chart_of_accounts.type", ["revenue", "expense"])
      .is("journal_entries.closing_year", null)
      .gte("journal_entries.entry_date", params.dateFrom)
      .lte("journal_entries.entry_date", params.dateTo)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as Raw[]) {
      const a = Array.isArray(r.chart_of_accounts) ? r.chart_of_accounts[0] : r.chart_of_accounts;
      if (!a) continue;
      lines.push({ accountCode: a.code, accountName: a.name, type: a.type, department: r.department, debit: Number(r.debit) || 0, credit: Number(r.credit) || 0 });
    }
    if (!data || data.length < 1000) break;
  }
  return buildDepartmentPnl(lines);
}
