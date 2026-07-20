import type { SupabaseClient } from "@supabase/supabase-js";

export type GuestServiceCategoryRow = {
  id: string;
  name: string;
  code: string;
  department: string;
  sortOrder: number;
  isActive: boolean;
};

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "category";
}

export async function listGuestServiceCategories(
  service: SupabaseClient,
  tenantId: string,
  opts?: { activeOnly?: boolean },
): Promise<GuestServiceCategoryRow[]> {
  let q = service
    .schema("hotel")
    .from("guest_service_categories")
    .select("id,name,code,department,sort_order,is_active")
    .eq("tenant_id", tenantId)
    .order("sort_order", { ascending: true });
  if (opts?.activeOnly) q = q.eq("is_active", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    code: r.code as string,
    department: r.department as string,
    sortOrder: r.sort_order as number,
    isActive: r.is_active as boolean,
  }));
}

/** Resolves the department a category routes to, so notifications and requisition-style
 * routing always follow the tenant's own configuration rather than a hardcoded map. */
export async function getCategoryDepartment(
  service: SupabaseClient,
  tenantId: string,
  code: string,
): Promise<string | null> {
  const { data } = await service
    .schema("hotel")
    .from("guest_service_categories")
    .select("department")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .maybeSingle();
  return (data?.department as string | undefined) ?? null;
}

export async function isKnownActiveCategory(service: SupabaseClient, tenantId: string, code: string): Promise<boolean> {
  const { data } = await service
    .schema("hotel")
    .from("guest_service_categories")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();
  return Boolean(data);
}

export async function createGuestServiceCategory(
  service: SupabaseClient,
  params: { tenantId: string; name: string; department: string },
): Promise<{ row: GuestServiceCategoryRow | null; error: string | null }> {
  const name = params.name.trim();
  if (!name) return { row: null, error: "Name is required." };

  const { data: existing } = await service
    .schema("hotel")
    .from("guest_service_categories")
    .select("sort_order,code")
    .eq("tenant_id", params.tenantId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = existing ? (existing.sort_order as number) + 1 : 0;

  let code = slugify(name);
  const { data: codeClash } = await service
    .schema("hotel")
    .from("guest_service_categories")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("code", code)
    .maybeSingle();
  if (codeClash) code = `${code}_${Date.now().toString(36)}`;

  const { data, error } = await service
    .schema("hotel")
    .from("guest_service_categories")
    .insert({
      tenant_id: params.tenantId,
      name,
      code,
      department: params.department,
      sort_order: nextSort,
    })
    .select("id,name,code,department,sort_order,is_active")
    .single();

  if (error || !data) return { row: null, error: error?.message ?? "Could not create category." };

  return {
    row: {
      id: data.id as string,
      name: data.name as string,
      code: data.code as string,
      department: data.department as string,
      sortOrder: data.sort_order as number,
      isActive: data.is_active as boolean,
    },
    error: null,
  };
}

export async function updateGuestServiceCategory(
  service: SupabaseClient,
  params: { tenantId: string; id: string; name?: string; department?: string; isActive?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (params.name !== undefined) patch.name = params.name.trim();
  if (params.department !== undefined) patch.department = params.department;
  if (params.isActive !== undefined) patch.is_active = params.isActive;

  const { error } = await service
    .schema("hotel")
    .from("guest_service_categories")
    .update(patch)
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteGuestServiceCategory(
  service: SupabaseClient,
  params: { tenantId: string; id: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await service
    .schema("hotel")
    .from("guest_service_categories")
    .delete()
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
