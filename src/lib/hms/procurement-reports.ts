import type { SupabaseClient } from "@supabase/supabase-js";
import { getVendorScorecard } from "@/lib/hms/procurement-vendors";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

const COUNTED_STATUSES = ["approved", "ordered", "partially_received", "received", "closed"];

/** fx_rate is "1 PO currency = fx_rate units of the hotel's base currency" — always convert before aggregating across POs, since they may not share a currency. */
function baseAmount(o: { total: unknown; fx_rate: unknown }): number {
  return num(o.total) * (num(o.fx_rate) || 1);
}

export type SpendByVendor = { vendorId: string; vendorName: string; total: number; orderCount: number };
export type SpendByDepartment = { department: string; total: number; orderCount: number };
export type SpendByCategory = { categoryName: string; total: number; orderCount: number };

export async function getSpendByVendor(supabase: SupabaseClient, tenantId: string): Promise<SpendByVendor[]> {
  const { data: orders } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .select("vendor_id,total,fx_rate")
    .eq("tenant_id", tenantId)
    .in("status", COUNTED_STATUSES);
  const rows = orders ?? [];
  const vendorIds = [...new Set(rows.map((o) => o.vendor_id as string))];
  const { data: vendors } = vendorIds.length
    ? await supabase.schema("hotel").from("vendors").select("id,name").in("id", vendorIds)
    : { data: [] };
  const nameById = new Map((vendors ?? []).map((v) => [v.id as string, v.name as string]));

  const byVendor = new Map<string, { total: number; count: number }>();
  for (const o of rows) {
    const entry = byVendor.get(o.vendor_id as string) ?? { total: 0, count: 0 };
    entry.total += baseAmount(o);
    entry.count += 1;
    byVendor.set(o.vendor_id as string, entry);
  }

  return [...byVendor.entries()]
    .map(([vendorId, v]) => ({ vendorId, vendorName: nameById.get(vendorId) ?? "Unknown vendor", total: v.total, orderCount: v.count }))
    .sort((a, b) => b.total - a.total);
}

export async function getSpendByDepartment(supabase: SupabaseClient, tenantId: string): Promise<SpendByDepartment[]> {
  const { data: orders } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .select("department,total,fx_rate")
    .eq("tenant_id", tenantId)
    .in("status", COUNTED_STATUSES);

  const byDept = new Map<string, { total: number; count: number }>();
  for (const o of orders ?? []) {
    const entry = byDept.get(o.department as string) ?? { total: 0, count: 0 };
    entry.total += baseAmount(o);
    entry.count += 1;
    byDept.set(o.department as string, entry);
  }
  return [...byDept.entries()]
    .map(([department, v]) => ({ department, total: v.total, orderCount: v.count }))
    .sort((a, b) => b.total - a.total);
}

export async function getSpendByCategory(supabase: SupabaseClient, tenantId: string): Promise<SpendByCategory[]> {
  const { data: orders } = await supabase
    .schema("hotel")
    .from("purchase_orders")
    .select("vendor_id,total,fx_rate")
    .eq("tenant_id", tenantId)
    .in("status", COUNTED_STATUSES);
  const rows = orders ?? [];
  const vendorIds = [...new Set(rows.map((o) => o.vendor_id as string))];
  const { data: vendors } = vendorIds.length
    ? await supabase.schema("hotel").from("vendors").select("id,category_id").in("id", vendorIds)
    : { data: [] };
  const categoryIdByVendor = new Map((vendors ?? []).map((v) => [v.id as string, (v.category_id as string) ?? null]));

  const categoryIds = [...new Set([...categoryIdByVendor.values()].filter((id): id is string => Boolean(id)))];
  const { data: categories } = categoryIds.length
    ? await supabase.schema("hotel").from("vendor_categories").select("id,name").in("id", categoryIds)
    : { data: [] };
  const categoryNameById = new Map((categories ?? []).map((c) => [c.id as string, c.name as string]));

  const byCategory = new Map<string, { total: number; count: number }>();
  for (const o of rows) {
    const categoryId = categoryIdByVendor.get(o.vendor_id as string);
    const label = categoryId ? categoryNameById.get(categoryId) ?? "Uncategorized" : "Uncategorized";
    const entry = byCategory.get(label) ?? { total: 0, count: 0 };
    entry.total += baseAmount(o);
    entry.count += 1;
    byCategory.set(label, entry);
  }
  return [...byCategory.entries()]
    .map(([categoryName, v]) => ({ categoryName, total: v.total, orderCount: v.count }))
    .sort((a, b) => b.total - a.total);
}

export type VendorPerformanceReportRow = {
  vendorId: string;
  vendorName: string;
  status: string;
  totalOrders: number;
  totalSpend: number;
  onTimeRate: number | null;
  avgQualityScore: number | null;
  qualityRejectionRate: number | null;
};

export async function getVendorPerformanceReport(supabase: SupabaseClient, tenantId: string): Promise<VendorPerformanceReportRow[]> {
  const { data: vendors } = await supabase.schema("hotel").from("vendors").select("id,name,status").eq("tenant_id", tenantId);
  const rows = vendors ?? [];
  const scorecards = await Promise.all(rows.map((v) => getVendorScorecard(supabase, tenantId, v.id as string)));

  return rows
    .map((v, idx) => ({
      vendorId: v.id as string,
      vendorName: v.name as string,
      status: v.status as string,
      totalOrders: scorecards[idx].totalOrders,
      totalSpend: scorecards[idx].totalSpend,
      onTimeRate: scorecards[idx].onTimeRate,
      avgQualityScore: scorecards[idx].avgQualityScore,
      qualityRejectionRate: scorecards[idx].qualityRejectionRate,
    }))
    .sort((a, b) => b.totalSpend - a.totalSpend);
}
