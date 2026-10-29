import type { SupabaseClient } from "@supabase/supabase-js";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";
import {
  type FbPriceRule,
  type FbPriceRuleInput,
  type HotelClock,
  hotelClock,
  shortTime,
} from "@/lib/hms/fb-price-rules";

/** Price rules plus the hotel's clock right now: what a line is priced with. */
export type FbPricingNow = { rules: FbPriceRule[]; clock: HotelClock };

export function mapPriceRule(r: Record<string, unknown>): FbPriceRule {
  return {
    id: r.id as string,
    name: r.name as string,
    outlet_id: (r.outlet_id as string) ?? null,
    category_ids: Array.isArray(r.category_ids) ? (r.category_ids as string[]) : [],
    days: Array.isArray(r.days) ? (r.days as unknown[]).map(Number) : [],
    starts_at: shortTime(String(r.starts_at ?? "")),
    ends_at: shortTime(String(r.ends_at ?? "")),
    change_percent: Number(r.change_percent) || 0,
    is_active: r.is_active !== false,
    sort_order: Number(r.sort_order) || 0,
  };
}

export async function loadPriceRules(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("fb_price_rules")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map((r) => mapPriceRule(r as Record<string, unknown>));
}

/** Loads the switched-on rules and reads the hotel's clock, once per request. */
export async function loadPricingNow(supabase: SupabaseClient, tenantId: string, at = new Date()): Promise<FbPricingNow> {
  const [rules, settings] = await Promise.all([
    loadPriceRules(supabase, tenantId),
    getTenantFbSettings(supabase, tenantId),
  ]);
  return { rules: rules.filter((r) => r.is_active), clock: hotelClock(at, settings.timeZone) };
}

function toRow(input: FbPriceRuleInput) {
  return {
    name: input.name.trim(),
    outlet_id: input.outletId,
    category_ids: [...new Set(input.categoryIds)],
    days: [...new Set(input.days)].sort((a, b) => a - b),
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    change_percent: Math.round(input.changePercent * 100) / 100,
    is_active: input.isActive,
  };
}

/** Outlet and categories must belong to this hotel. */
async function checkScope(supabase: SupabaseClient, tenantId: string, input: FbPriceRuleInput) {
  if (input.outletId) {
    const { data } = await supabase
      .schema("hotel")
      .from("fb_outlets")
      .select("id")
      .eq("id", input.outletId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!data) return "That outlet no longer exists.";
  }
  if (input.categoryIds.length) {
    const ids = [...new Set(input.categoryIds)];
    const { data } = await supabase
      .schema("hotel")
      .from("fb_menu_categories")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("id", ids);
    if ((data ?? []).length !== ids.length) return "One of the categories no longer exists.";
  }
  return null;
}

export async function createPriceRule(supabase: SupabaseClient, tenantId: string, input: FbPriceRuleInput) {
  const scopeError = await checkScope(supabase, tenantId, input);
  if (scopeError) return { rule: null, error: scopeError };
  const { count } = await supabase
    .schema("hotel")
    .from("fb_price_rules")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_price_rules")
    .insert({ tenant_id: tenantId, ...toRow(input), sort_order: count ?? 0 })
    .select("*")
    .single();
  return { rule: data ? mapPriceRule(data) : null, error: error?.message ?? null };
}

export async function updatePriceRule(
  supabase: SupabaseClient,
  tenantId: string,
  ruleId: string,
  input: FbPriceRuleInput,
) {
  const scopeError = await checkScope(supabase, tenantId, input);
  if (scopeError) return { before: null, rule: null, error: scopeError };
  const { data: before } = await supabase
    .schema("hotel")
    .from("fb_price_rules")
    .select("*")
    .eq("id", ruleId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!before) return { before: null, rule: null, error: "That price rule no longer exists." };
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_price_rules")
    .update({ ...toRow(input), updated_at: new Date().toISOString() })
    .eq("id", ruleId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  return { before: mapPriceRule(before), rule: data ? mapPriceRule(data) : null, error: error?.message ?? null };
}

export async function deletePriceRule(supabase: SupabaseClient, tenantId: string, ruleId: string) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_price_rules")
    .delete()
    .eq("id", ruleId)
    .eq("tenant_id", tenantId)
    .select("*");
  if (error) return { rule: null, error: error.message };
  if (!data?.length) return { rule: null, error: "That price rule no longer exists." };
  return { rule: mapPriceRule(data[0]), error: null };
}
