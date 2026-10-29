import type { SupabaseClient } from "@supabase/supabase-js";
import { clampRate, FB_RATE_LIMITS, type FbBillRates, NO_BILL_CHARGES } from "@/lib/hms/fb-bill-rules";
import { DEFAULT_FB_TIME_ZONE, isValidTimeZone } from "@/lib/hms/fb-price-rules";

/** Fallback when nothing has been saved in back office. */
export const DEFAULT_KITCHEN_OVERDUE_MINUTES = 10;

export const KITCHEN_OVERDUE_MINUTES_MIN = 1;
export const KITCHEN_OVERDUE_MINUTES_MAX = 120;

export type TenantFbSettings = {
  kitchenOverdueMinutes: number;
  kitchenOverdueMinutesConfigured: boolean;
  /** Service charge, levy and VAT for new bills. */
  billRates: FbBillRates;
  /** The hotel's clock for happy hours and other price rules. */
  timeZone: string;
};

export function resolveKitchenOverdueMinutes(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return DEFAULT_KITCHEN_OVERDUE_MINUTES;
  return Math.min(
    KITCHEN_OVERDUE_MINUTES_MAX,
    Math.max(KITCHEN_OVERDUE_MINUTES_MIN, Math.round(value)),
  );
}

export async function getTenantFbSettings(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<TenantFbSettings> {
  const { data } = await supabase
    .schema("hotel")
    .from("tenant_fb_settings")
    .select("kitchen_overdue_minutes,service_charge_percent,levy_percent,vat_percent,prices_include_tax,time_zone")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    kitchenOverdueMinutes: resolveKitchenOverdueMinutes(data?.kitchen_overdue_minutes),
    kitchenOverdueMinutesConfigured: data?.kitchen_overdue_minutes != null,
    billRates: data
      ? {
          service_charge_percent: Number(data.service_charge_percent) || 0,
          levy_percent: Number(data.levy_percent) || 0,
          vat_percent: Number(data.vat_percent) || 0,
          prices_include_tax: data.prices_include_tax !== false,
        }
      : NO_BILL_CHARGES,
    timeZone:
      typeof data?.time_zone === "string" && isValidTimeZone(data.time_zone) ? data.time_zone : DEFAULT_FB_TIME_ZONE,
  };
}

export async function upsertTenantFbSettings(
  supabase: SupabaseClient,
  tenantId: string,
  input: { kitchenOverdueMinutes: number },
) {
  const kitchen_overdue_minutes = resolveKitchenOverdueMinutes(input.kitchenOverdueMinutes);
  const { error } = await supabase
    .schema("hotel")
    .from("tenant_fb_settings")
    .upsert(
      {
        tenant_id: tenantId,
        kitchen_overdue_minutes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  if (error) throw error;
  return {
    kitchenOverdueMinutes: kitchen_overdue_minutes,
    kitchenOverdueMinutesConfigured: true,
  };
}

/** Saves the service charge, levy and VAT used for bills opened from now on. */
export async function upsertTenantFbBillRates(supabase: SupabaseClient, tenantId: string, input: FbBillRates) {
  const row = {
    tenant_id: tenantId,
    service_charge_percent: clampRate(input.service_charge_percent, FB_RATE_LIMITS.service),
    levy_percent: clampRate(input.levy_percent, FB_RATE_LIMITS.levy),
    vat_percent: clampRate(input.vat_percent, FB_RATE_LIMITS.vat),
    prices_include_tax: input.prices_include_tax,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.schema("hotel").from("tenant_fb_settings").upsert(row, { onConflict: "tenant_id" });
  if (error) throw error;
  return getTenantFbSettings(supabase, tenantId);
}

/** Saves the time zone that price-rule hours are read in. */
export async function upsertTenantFbTimeZone(supabase: SupabaseClient, tenantId: string, timeZone: string) {
  const { error } = await supabase
    .schema("hotel")
    .from("tenant_fb_settings")
    .upsert({ tenant_id: tenantId, time_zone: timeZone, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  if (error) throw error;
}
