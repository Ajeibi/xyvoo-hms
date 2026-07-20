import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyBudgetThresholdReached } from "@/lib/hms/notification-rules";
import type { ProcurementBudgetWithSpend } from "@/lib/hms/procurement-types";

const BUDGET_ALERT_THRESHOLD_PERCENT = 90;

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

const COMMITTED_STATUSES = ["approved", "ordered", "partially_received", "received", "closed"];

async function attachSpend(
  supabase: SupabaseClient,
  tenantId: string,
  budgets: { id: string; tenant_id: string; department: string; period_start: string; period_end: string; amount: number; currency: string; created_at: string; updated_at: string }[],
): Promise<ProcurementBudgetWithSpend[]> {
  return Promise.all(
    budgets.map(async (b) => {
      const { data: orders } = await supabase
        .schema("hotel")
        .from("purchase_orders")
        .select("total,fx_rate")
        .eq("tenant_id", tenantId)
        .eq("department", b.department)
        .in("status", COMMITTED_STATUSES)
        .gte("created_at", b.period_start)
        .lte("created_at", b.period_end);

      // fx_rate is "1 PO currency = fx_rate units of the hotel's base currency" (defaults to 1
      // when the PO is already in the base currency) — convert before summing across currencies.
      const spent = (orders ?? []).reduce((sum, o) => sum + num(o.total) * (num(o.fx_rate) || 1), 0);
      const remaining = Math.max(b.amount - spent, 0);
      const percentUsed = b.amount > 0 ? Math.round((spent / b.amount) * 100) : 0;
      return { ...b, spent, remaining, percentUsed };
    }),
  );
}

export async function listBudgets(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("procurement_budgets")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("period_start", { ascending: false });
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    department: r.department as string,
    period_start: r.period_start as string,
    period_end: r.period_end as string,
    amount: num(r.amount),
    currency: (r.currency as string) ?? "NGN",
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
  return attachSpend(supabase, tenantId, rows);
}

export async function upsertBudget(
  supabase: SupabaseClient,
  params: { tenantId: string; department: string; periodStart: string; periodEnd: string; amount: number; currency?: string },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("procurement_budgets")
    .upsert(
      {
        tenant_id: params.tenantId,
        department: params.department.trim(),
        period_start: params.periodStart,
        period_end: params.periodEnd,
        amount: params.amount,
        currency: params.currency?.trim().toUpperCase() || "NGN",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,department,period_start" },
    )
    .select("*")
    .single();
  if (error || !data) return { budget: null, error: error?.message ?? "Could not save budget." };
  return { budget: data, error: null };
}

/** Current-period budget burn average, for the Procurement dashboard KPI. Null when no budgets are configured. */
export async function getCurrentBudgetBurnPercent(supabase: SupabaseClient, tenantId: string): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .schema("hotel")
    .from("procurement_budgets")
    .select("*")
    .eq("tenant_id", tenantId)
    .lte("period_start", today)
    .gte("period_end", today);
  if (!data?.length) return null;

  const rows = data.map((r) => ({
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    department: r.department as string,
    period_start: r.period_start as string,
    period_end: r.period_end as string,
    amount: num(r.amount),
    currency: (r.currency as string) ?? "NGN",
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  }));
  const withSpend = await attachSpend(supabase, tenantId, rows);
  const withBudget = withSpend.filter((b) => b.amount > 0);
  if (!withBudget.length) return null;
  return Math.round(withBudget.reduce((sum, b) => sum + b.percentUsed, 0) / withBudget.length);
}

/**
 * Checks the current-period budget for a department and fires a
 * notification the first time it crosses the alert threshold in a given
 * day — called after any purchase order transitions into committed spend
 * (auto-approved on creation, or approved).
 */
export async function checkAndNotifyBudgetThreshold(supabase: SupabaseClient, tenantId: string, department: string) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: budget } = await supabase
    .schema("hotel")
    .from("procurement_budgets")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("department", department)
    .lte("period_start", today)
    .gte("period_end", today)
    .maybeSingle();
  if (!budget || num(budget.amount) <= 0) return;

  const [withSpend] = await attachSpend(supabase, tenantId, [
    {
      id: budget.id as string,
      tenant_id: budget.tenant_id as string,
      department: budget.department as string,
      period_start: budget.period_start as string,
      period_end: budget.period_end as string,
      amount: num(budget.amount),
      currency: (budget.currency as string) ?? "NGN",
      created_at: budget.created_at as string,
      updated_at: budget.updated_at as string,
    },
  ]);
  if (withSpend.percentUsed < BUDGET_ALERT_THRESHOLD_PERCENT) return;

  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: existing } = await supabase
    .schema("hotel")
    .from("notifications")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", "budget_threshold_reached")
    .eq("entity_id", budget.id)
    .gte("created_at", since)
    .limit(1);
  if (existing?.length) return;

  await notifyBudgetThresholdReached({ tenantId, department, percentUsed: withSpend.percentUsed, entityId: budget.id as string });
}
