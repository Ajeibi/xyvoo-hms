import type { SupabaseClient } from "@supabase/supabase-js";
import { listSourceableRequisitionLines } from "@/lib/hms/procurement-orders";
import { getCurrentBudgetBurnPercent } from "@/lib/hms/procurement-budgets";
import type { ProcurementDashboardStats } from "@/lib/hms/procurement-types";

export async function getProcurementDashboardStats(supabase: SupabaseClient, tenantId: string): Promise<ProcurementDashboardStats> {
  const today = new Date().toISOString().slice(0, 10);

  const [sourceable, { count: pendingApprovalCount }, { count: overdueCount }, { count: openCount }, { count: activeVendorCount }, budgetBurnPercent] =
    await Promise.all([
      listSourceableRequisitionLines(supabase, tenantId),
      supabase.schema("hotel").from("purchase_orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "pending_approval"),
      supabase
        .schema("hotel")
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["ordered", "partially_received"])
        .lt("expected_delivery_date", today),
      supabase
        .schema("hotel")
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["approved", "ordered", "partially_received"]),
      supabase.schema("hotel").from("vendors").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).in("status", ["active", "preferred"]),
      getCurrentBudgetBurnPercent(supabase, tenantId),
    ]);

  const requisitionsAwaitingSourcing = new Set(sourceable.map((l) => l.requisitionId)).size;

  return {
    requisitionsAwaitingSourcing,
    ordersPendingApproval: pendingApprovalCount ?? 0,
    ordersOverdue: overdueCount ?? 0,
    openOrders: openCount ?? 0,
    budgetBurnPercent,
    activeVendors: activeVendorCount ?? 0,
  };
}
