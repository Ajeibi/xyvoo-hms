import type { SupabaseClient } from "@supabase/supabase-js";

/** Fallback when nothing has been saved in back office. */
export const DEFAULT_KITCHEN_OVERDUE_MINUTES = 10;

export const KITCHEN_OVERDUE_MINUTES_MIN = 1;
export const KITCHEN_OVERDUE_MINUTES_MAX = 120;

export type TenantFbSettings = {
  kitchenOverdueMinutes: number;
  kitchenOverdueMinutesConfigured: boolean;
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
    .select("kitchen_overdue_minutes")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  return {
    kitchenOverdueMinutes: resolveKitchenOverdueMinutes(data?.kitchen_overdue_minutes),
    kitchenOverdueMinutesConfigured: data?.kitchen_overdue_minutes != null,
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
