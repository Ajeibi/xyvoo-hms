import type { SupabaseClient } from "@supabase/supabase-js";

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Debit-normal account types increase with a debit; credit-normal types increase with a credit.
 * Used to sign trial-balance/statement figures correctly without a redundant stored column. */
export function isDebitNormal(type: AccountType): boolean {
  return type === "asset" || type === "expense";
}

export type ChartOfAccountRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  parentId: string | null;
  isActive: boolean;
};

/** Resolves a well-known control account by its starter-chart code (e.g. "1000" Cash on
 * Hand). Returns null if the tenant has no active account with that code — callers decide
 * whether that's a hard error (per-tenant charts are editable, so a code isn't guaranteed
 * to exist or stay put). */
export async function getAccountIdByCode(
  service: SupabaseClient,
  tenantId: string,
  code: string,
): Promise<string | null> {
  const { data } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function listChartOfAccounts(
  service: SupabaseClient,
  tenantId: string,
  opts?: { activeOnly?: boolean },
): Promise<ChartOfAccountRow[]> {
  let q = service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,code,name,type,parent_id,is_active")
    .eq("tenant_id", tenantId)
    .order("code", { ascending: true });
  if (opts?.activeOnly) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    type: r.type as AccountType,
    parentId: (r.parent_id as string | null) ?? null,
    isActive: r.is_active as boolean,
  }));
}

export async function createAccount(
  service: SupabaseClient,
  params: { tenantId: string; code: string; name: string; type: AccountType; parentId?: string | null },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const code = params.code.trim();
  const name = params.name.trim();
  if (!code || !name) return { ok: false, error: "Code and name are required." };

  const { data, error } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .insert({
      tenant_id: params.tenantId,
      code,
      name,
      type: params.type,
      parent_id: params.parentId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Account code ${code} already exists.` };
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id as string };
}

export async function updateAccount(
  service: SupabaseClient,
  params: { tenantId: string; id: string; name?: string; type?: AccountType; isActive?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.type !== undefined) patch.type = params.type;
  if (params.isActive !== undefined) patch.is_active = params.isActive;

  const { error } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .update(patch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** A real, usable starting chart for a hotel — not exhaustive USALI-department detail
 * (that's Phase 3), just enough for a property to start posting balanced entries on day one. */
const HOSPITALITY_STARTER_ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: "1000", name: "Cash on Hand", type: "asset" },
  { code: "1010", name: "Bank Account", type: "asset" },
  { code: "1020", name: "Card & POS Clearing", type: "asset" },
  { code: "1100", name: "Accounts Receivable", type: "asset" },
  { code: "1200", name: "Guest Ledger", type: "asset" },
  { code: "1300", name: "City Ledger", type: "asset" },
  { code: "1400", name: "Inventory", type: "asset" },
  { code: "1500", name: "Fixed Assets", type: "asset" },
  { code: "1590", name: "Accumulated Depreciation", type: "asset" },
  { code: "2000", name: "Accounts Payable", type: "liability" },
  { code: "2100", name: "Accrued Expenses", type: "liability" },
  { code: "2200", name: "Taxes Payable", type: "liability" },
  { code: "2300", name: "Advance Guest Deposits", type: "liability" },
  { code: "2400", name: "Deferred Revenue", type: "liability" },
  { code: "3000", name: "Owner's Equity", type: "equity" },
  { code: "3100", name: "Retained Earnings", type: "equity" },
  { code: "4000", name: "Room Revenue", type: "revenue" },
  { code: "4100", name: "Food & Beverage Revenue", type: "revenue" },
  { code: "4200", name: "Other Operated Departments Revenue", type: "revenue" },
  { code: "4300", name: "Miscellaneous Income", type: "revenue" },
  { code: "5000", name: "Cost of Goods Sold — F&B", type: "expense" },
  { code: "5100", name: "Payroll & Related Expenses", type: "expense" },
  { code: "5200", name: "Utilities", type: "expense" },
  { code: "5300", name: "Repairs & Maintenance", type: "expense" },
  { code: "5400", name: "Sales & Marketing", type: "expense" },
  { code: "5500", name: "Administrative & General", type: "expense" },
  { code: "5600", name: "Commission & OTA Fees", type: "expense" },
  { code: "5700", name: "Depreciation Expense", type: "expense" },
];

/** Idempotent — only inserts codes the tenant doesn't already have, so re-running (or
 * running after a few manual accounts were already added) never duplicates or errors. */
export async function seedHospitalityChartOfAccounts(
  service: SupabaseClient,
  tenantId: string,
): Promise<{ inserted: number }> {
  const existing = await listChartOfAccounts(service, tenantId);
  const existingCodes = new Set(existing.map((a) => a.code));
  const toInsert = HOSPITALITY_STARTER_ACCOUNTS.filter((a) => !existingCodes.has(a.code));
  if (toInsert.length === 0) return { inserted: 0 };

  const { error } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .insert(toInsert.map((a) => ({ tenant_id: tenantId, code: a.code, name: a.name, type: a.type })));

  if (error) throw new Error(error.message);
  return { inserted: toInsert.length };
}
