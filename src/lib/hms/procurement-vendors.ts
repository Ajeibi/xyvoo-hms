import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  VendorCategoryRow,
  VendorCertification,
  VendorPerformanceReviewRow,
  VendorPriceCatalogRow,
  VendorPriceCatalogWithItem,
  VendorRow,
  VendorScorecard,
  VendorStatus,
  VendorWithCategory,
} from "@/lib/hms/procurement-types";
import { resolveInventoryItemDisplay } from "@/lib/hms/inventory-stock";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function slugifyCode(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

// --- Vendor categories (tenant-managed lookup) ---

function mapCategory(r: Record<string, unknown>): VendorCategoryRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    code: r.code as string,
    sort_order: Number(r.sort_order) || 0,
    is_active: Boolean(r.is_active),
    created_at: r.created_at as string,
  };
}

export async function listVendorCategories(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("vendor_categories")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => mapCategory(r as Record<string, unknown>));
}

export async function createVendorCategory(
  supabase: SupabaseClient,
  params: { tenantId: string; name: string; sortOrder?: number },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("vendor_categories")
    .insert({
      tenant_id: params.tenantId,
      name: params.name.trim(),
      code: slugifyCode(params.name),
      sort_order: params.sortOrder ?? 0,
    })
    .select("*")
    .single();
  if (error || !data) return { category: null, error: error?.message ?? "Could not create category." };
  return { category: mapCategory(data as Record<string, unknown>), error: null };
}

export async function updateVendorCategory(
  supabase: SupabaseClient,
  tenantId: string,
  id: string,
  patch: { name?: string; sortOrder?: number; isActive?: boolean },
) {
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.isActive !== undefined) update.is_active = patch.isActive;

  const { data, error } = await supabase
    .schema("hotel")
    .from("vendor_categories")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { category: null, error: error?.message ?? "Could not update category." };
  return { category: mapCategory(data as Record<string, unknown>), error: null };
}

export async function deleteVendorCategory(supabase: SupabaseClient, tenantId: string, id: string) {
  const { error } = await supabase.schema("hotel").from("vendor_categories").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) {
    if (error.code === "23503") {
      return { error: "Still in use by one or more vendors — deactivate it instead, or reassign them first." };
    }
    return { error: error.message };
  }
  return { error: null };
}

// --- Vendors ---

function mapVendor(r: Record<string, unknown>): VendorRow {
  const rawCerts = r.certifications;
  const certifications: VendorCertification[] = Array.isArray(rawCerts)
    ? (rawCerts as unknown[]).filter((c): c is VendorCertification => typeof c === "object" && c !== null && "label" in c)
    : [];
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    name: r.name as string,
    category_id: (r.category_id as string) ?? null,
    contact_name: (r.contact_name as string) ?? null,
    phone: (r.phone as string) ?? null,
    email: (r.email as string) ?? null,
    address: (r.address as string) ?? null,
    country: (r.country as string) ?? null,
    currency: (r.currency as string) ?? "NGN",
    payment_terms: (r.payment_terms as string) ?? null,
    lead_time_days: Number(r.lead_time_days) || 0,
    status: (r.status as VendorStatus) ?? "active",
    certifications,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

async function attachCategoryNames(
  supabase: SupabaseClient,
  tenantId: string,
  rows: VendorRow[],
): Promise<VendorWithCategory[]> {
  const categoryIds = [...new Set(rows.map((r) => r.category_id).filter((id): id is string => Boolean(id)))];
  const nameById = new Map<string, string>();
  if (categoryIds.length) {
    const { data } = await supabase
      .schema("hotel")
      .from("vendor_categories")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .in("id", categoryIds);
    for (const c of data ?? []) nameById.set(c.id as string, c.name as string);
  }
  return rows.map((r) => ({ ...r, category_name: r.category_id ? nameById.get(r.category_id) ?? null : null }));
}

export async function listVendors(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { status?: VendorStatus[]; categoryId?: string; search?: string },
) {
  let q = supabase.schema("hotel").from("vendors").select("*").eq("tenant_id", tenantId).order("name", { ascending: true });
  if (opts?.status?.length) q = q.in("status", opts.status);
  if (opts?.categoryId) q = q.eq("category_id", opts.categoryId);
  if (opts?.search) q = q.ilike("name", `%${opts.search}%`);

  const { data } = await q;
  const vendors = (data ?? []).map((r) => mapVendor(r as Record<string, unknown>));
  return attachCategoryNames(supabase, tenantId, vendors);
}

export async function getVendorById(supabase: SupabaseClient, tenantId: string, vendorId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("vendors")
    .select("*")
    .eq("id", vendorId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data) return null;
  const [vendor] = await attachCategoryNames(supabase, tenantId, [mapVendor(data as Record<string, unknown>)]);
  return vendor ?? null;
}

export async function createVendor(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    name: string;
    categoryId?: string | null;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    country?: string;
    currency?: string;
    paymentTerms?: string;
    leadTimeDays?: number;
    status?: VendorStatus;
    certifications?: string[];
    notes?: string;
  },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("vendors")
    .insert({
      tenant_id: params.tenantId,
      name: params.name.trim(),
      category_id: params.categoryId ?? null,
      contact_name: params.contactName?.trim() || null,
      phone: params.phone?.trim() || null,
      email: params.email?.trim() || null,
      address: params.address?.trim() || null,
      country: params.country?.trim() || null,
      currency: params.currency?.trim().toUpperCase() || "NGN",
      payment_terms: params.paymentTerms?.trim() || null,
      lead_time_days: params.leadTimeDays ?? 0,
      status: params.status ?? "active",
      certifications: (params.certifications ?? []).map((label) => ({ label })),
      notes: params.notes?.trim() || null,
    })
    .select("*")
    .single();
  if (error || !data) return { vendor: null, error: error?.message ?? "Could not create vendor." };
  const [vendor] = await attachCategoryNames(supabase, params.tenantId, [mapVendor(data as Record<string, unknown>)]);
  return { vendor, error: null };
}

export async function updateVendor(
  supabase: SupabaseClient,
  tenantId: string,
  vendorId: string,
  patch: {
    name?: string;
    categoryId?: string | null;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    country?: string | null;
    currency?: string;
    paymentTerms?: string | null;
    leadTimeDays?: number;
    status?: VendorStatus;
    certifications?: string[];
    notes?: string | null;
  },
) {
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.categoryId !== undefined) update.category_id = patch.categoryId;
  if (patch.contactName !== undefined) update.contact_name = patch.contactName?.trim() || null;
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null;
  if (patch.email !== undefined) update.email = patch.email?.trim() || null;
  if (patch.address !== undefined) update.address = patch.address?.trim() || null;
  if (patch.country !== undefined) update.country = patch.country?.trim() || null;
  if (patch.currency !== undefined) update.currency = patch.currency.trim().toUpperCase();
  if (patch.paymentTerms !== undefined) update.payment_terms = patch.paymentTerms?.trim() || null;
  if (patch.leadTimeDays !== undefined) update.lead_time_days = patch.leadTimeDays;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.certifications !== undefined) update.certifications = patch.certifications.map((label) => ({ label }));
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null;

  const { data, error } = await supabase
    .schema("hotel")
    .from("vendors")
    .update(update)
    .eq("id", vendorId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();
  if (error || !data) return { vendor: null, error: error?.message ?? "Could not update vendor." };
  const [vendor] = await attachCategoryNames(supabase, tenantId, [mapVendor(data as Record<string, unknown>)]);
  return { vendor, error: null };
}

// --- Vendor price catalog ---

function mapPriceCatalogRow(r: Record<string, unknown>): VendorPriceCatalogRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    vendor_id: r.vendor_id as string,
    item_id: r.item_id as string,
    unit_price: num(r.unit_price),
    currency: (r.currency as string) ?? "NGN",
    moq: num(r.moq),
    valid_from: (r.valid_from as string) ?? null,
    valid_to: (r.valid_to as string) ?? null,
    created_at: r.created_at as string,
  };
}

export async function listVendorPriceCatalog(
  supabase: SupabaseClient,
  tenantId: string,
  vendorId: string,
): Promise<VendorPriceCatalogWithItem[]> {
  const { data } = await supabase
    .schema("hotel")
    .from("vendor_price_catalog")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  const rows = (data ?? []).map((r) => mapPriceCatalogRow(r as Record<string, unknown>));
  const itemDetails = await resolveInventoryItemDisplay(supabase, tenantId, rows.map((r) => r.item_id));
  return rows.map((r) => {
    const item = itemDetails.get(r.item_id);
    return {
      ...r,
      item_name: item?.name ?? "Unknown item",
      item_sku: item?.sku ?? "",
      unit_of_measure: item?.unit_of_measure ?? "—",
    };
  });
}

export async function addVendorPriceCatalogEntry(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    vendorId: string;
    itemId: string;
    unitPrice: number;
    currency?: string;
    moq?: number;
    validFrom?: string;
    validTo?: string;
  },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("vendor_price_catalog")
    .upsert(
      {
        tenant_id: params.tenantId,
        vendor_id: params.vendorId,
        item_id: params.itemId,
        unit_price: params.unitPrice,
        currency: params.currency?.trim().toUpperCase() || "NGN",
        moq: params.moq ?? 0,
        valid_from: params.validFrom ?? null,
        valid_to: params.validTo ?? null,
      },
      { onConflict: "vendor_id,item_id" },
    )
    .select("*")
    .single();
  if (error || !data) return { entry: null, error: error?.message ?? "Could not save price catalog entry." };
  return { entry: mapPriceCatalogRow(data as Record<string, unknown>), error: null };
}

// --- Vendor performance ---

function mapReview(r: Record<string, unknown>): VendorPerformanceReviewRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    vendor_id: r.vendor_id as string,
    po_id: (r.po_id as string) ?? null,
    on_time: Boolean(r.on_time),
    quality_score: Number(r.quality_score) || 5,
    notes: (r.notes as string) ?? null,
    reviewed_by: r.reviewed_by as string,
    created_at: r.created_at as string,
  };
}

export async function addVendorPerformanceReview(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    vendorId: string;
    poId?: string;
    onTime: boolean;
    qualityScore: number;
    notes?: string;
    reviewedBy: string;
  },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("vendor_performance_reviews")
    .insert({
      tenant_id: params.tenantId,
      vendor_id: params.vendorId,
      po_id: params.poId ?? null,
      on_time: params.onTime,
      quality_score: params.qualityScore,
      notes: params.notes?.trim() || null,
      reviewed_by: params.reviewedBy,
    })
    .select("*")
    .single();
  if (error || !data) return { review: null, error: error?.message ?? "Could not save performance review." };
  return { review: mapReview(data as Record<string, unknown>), error: null };
}

export async function getVendorScorecard(
  supabase: SupabaseClient,
  tenantId: string,
  vendorId: string,
): Promise<VendorScorecard> {
  const [{ data: reviews }, { data: orders }] = await Promise.all([
    supabase.schema("hotel").from("vendor_performance_reviews").select("on_time,quality_score").eq("tenant_id", tenantId).eq("vendor_id", vendorId),
    supabase
      .schema("hotel")
      .from("purchase_orders")
      .select("total,fx_rate,status")
      .eq("tenant_id", tenantId)
      .eq("vendor_id", vendorId)
      .not("status", "in", "(draft,pending_approval,rejected,cancelled)"),
  ]);

  const reviewRows = reviews ?? [];
  const orderRows = orders ?? [];
  const onTimeCount = reviewRows.filter((r) => r.on_time).length;
  // fx_rate is "1 PO currency = fx_rate units of the hotel's base currency" — convert so
  // totalSpend is comparable across vendors that bill in different currencies.
  const totalSpend = orderRows.reduce((sum, o) => sum + num(o.total) * (num(o.fx_rate) || 1), 0);
  const qualityScores = reviewRows.map((r) => Number(r.quality_score) || 0).filter((n) => n > 0);
  const rejections = reviewRows.filter((r) => Number(r.quality_score) <= 2).length;

  return {
    vendorId,
    totalOrders: orderRows.length,
    onTimeRate: reviewRows.length ? onTimeCount / reviewRows.length : null,
    avgQualityScore: qualityScores.length ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length : null,
    qualityRejectionRate: reviewRows.length ? rejections / reviewRows.length : null,
    totalSpend,
  };
}
