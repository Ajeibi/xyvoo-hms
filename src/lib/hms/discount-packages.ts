import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiscountScope } from "@/lib/hms/walk-in-pricing";

export const DEFAULT_CHECKIN_DISCOUNT_THRESHOLD = 10;

export type DiscountPackageRow = {
  id: string;
  code: string;
  name: string | null;
  percent: number;
  scope: Exclude<DiscountScope, "none">;
  validFrom: string | null;
  validTo: string | null;
  isActive: boolean;
};

export const DISCOUNT_PACKAGE_SCOPES: { value: DiscountPackageRow["scope"]; label: string }[] = [
  { value: "all_nights", label: "All nights" },
  { value: "first_night", label: "First night only" },
  { value: "last_night", label: "Last night only" },
  { value: "first_and_last", label: "First and last night" },
];

const COLUMNS = "id,code,name,percent,scope,valid_from,valid_to,is_active";

function map(r: Record<string, unknown>): DiscountPackageRow {
  return {
    id: r.id as string,
    code: r.code as string,
    name: (r.name as string | null) ?? null,
    percent: Number(r.percent),
    scope: r.scope as DiscountPackageRow["scope"],
    validFrom: (r.valid_from as string | null) ?? null,
    validTo: (r.valid_to as string | null) ?? null,
    isActive: Boolean(r.is_active),
  };
}

export function normaliseDiscountCode(code: string) {
  return code.trim().toUpperCase();
}

export async function listDiscountPackages(service: SupabaseClient, tenantId: string): Promise<DiscountPackageRow[]> {
  const { data, error } = await service.schema("hotel").from("discount_packages").select(COLUMNS).eq("tenant_id", tenantId).order("code", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(map);
}

export type DiscountPackageInput = {
  code: string;
  name?: string | null;
  percent: number;
  scope: DiscountPackageRow["scope"];
  validFrom?: string | null;
  validTo?: string | null;
};

export async function createDiscountPackage(
  service: SupabaseClient,
  tenantId: string,
  input: DiscountPackageInput,
): Promise<{ row: DiscountPackageRow | null; error: string | null }> {
  const { data, error } = await service
    .schema("hotel")
    .from("discount_packages")
    .insert({
      tenant_id: tenantId,
      code: normaliseDiscountCode(input.code),
      name: input.name?.trim() || null,
      percent: input.percent,
      scope: input.scope,
      valid_from: input.validFrom || null,
      valid_to: input.validTo || null,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) {
    return { row: null, error: error?.code === "23505" ? "You already have a code with that name." : (error?.message ?? "Could not save the code.") };
  }
  return { row: map(data), error: null };
}

/**
 * Checks a code typed at check-in. A code must exist, be switched on and be inside its dates today.
 * The server uses this answer, never the percent the browser sends, so a code can't be faked.
 */
export async function findUsableDiscountPackage(
  service: SupabaseClient,
  tenantId: string,
  code: string,
  today: string,
): Promise<{ ok: true; pkg: DiscountPackageRow } | { ok: false; error: string }> {
  const wanted = normaliseDiscountCode(code);
  if (!wanted) return { ok: false, error: "Enter a discount code." };
  const { data, error } = await service
    .schema("hotel")
    .from("discount_packages")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("code", wanted)
    .maybeSingle();
  if (error) return { ok: false, error: "The discount codes couldn't be checked. Try again." };
  if (!data) return { ok: false, error: `"${wanted}" isn't a discount code for this hotel. Check the spelling.` };
  const pkg = map(data);
  if (!pkg.isActive) return { ok: false, error: `The code ${pkg.code} is switched off.` };
  if (pkg.validFrom && today < pkg.validFrom) return { ok: false, error: `The code ${pkg.code} isn't valid until ${pkg.validFrom}.` };
  if (pkg.validTo && today > pkg.validTo) return { ok: false, error: `The code ${pkg.code} expired on ${pkg.validTo}.` };
  return { ok: true, pkg };
}

/** A manual discount above this percent at check-in needs a manager. Falls back to the default if unset. */
export async function getCheckInDiscountThreshold(service: SupabaseClient, tenantId: string): Promise<number> {
  const { data, error } = await service.schema("hotel").from("tenant_folio_settings").select("checkin_discount_threshold_percent").eq("tenant_id", tenantId).maybeSingle();
  if (error || data?.checkin_discount_threshold_percent == null) return DEFAULT_CHECKIN_DISCOUNT_THRESHOLD;
  return Number(data.checkin_discount_threshold_percent);
}

export async function setCheckInDiscountThreshold(service: SupabaseClient, tenantId: string, percent: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await service
    .schema("hotel")
    .from("tenant_folio_settings")
    .upsert({ tenant_id: tenantId, checkin_discount_threshold_percent: percent, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}
