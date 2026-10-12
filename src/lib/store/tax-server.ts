import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapTaxSettings, NO_TAX, TAX_COLUMNS, type TaxSettings, type TaxSettingsRow } from "./tax";

/** A shop's tax settings. No tax if they've never been set, or the tax columns aren't there yet. */
export async function getTaxSettings(tenantId: string): Promise<TaxSettings> {
  const { data, error } = await createServerSupabaseClient()
    .schema("store")
    .from("business_profile")
    .select(TAX_COLUMNS)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error || !data) return NO_TAX;
  return mapTaxSettings(data as unknown as TaxSettingsRow);
}
