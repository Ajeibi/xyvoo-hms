import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExternalAccount } from "@/lib/hms/accounting-sync/driver";
import { suggestMappings } from "@/lib/hms/accounting-sync/suggest-mappings";
import { PROVIDER } from "@/lib/hms/accounting-sync/connection";

export type MappingRow = { accountCode: string; externalAccountId: string; externalAccountName: string };

export async function loadAccountMap(service: SupabaseClient, tenantId: string): Promise<MappingRow[]> {
  const { data } = await service
    .schema("hotel")
    .from("accounting_account_map")
    .select("account_code,external_account_id,external_account_name")
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER);
  return ((data ?? []) as { account_code: string; external_account_id: string; external_account_name: string }[]).map((r) => ({
    accountCode: r.account_code,
    externalAccountId: r.external_account_id,
    externalAccountName: r.external_account_name,
  }));
}

/** Replaces the map with the given rows (rows with an empty Sage id are removed). */
export async function saveAccountMap(service: SupabaseClient, tenantId: string, rows: MappingRow[]): Promise<void> {
  const keep = rows.filter((r) => r.externalAccountId);
  const drop = rows.filter((r) => !r.externalAccountId).map((r) => r.accountCode);
  const table = () => service.schema("hotel").from("accounting_account_map");
  if (keep.length > 0) {
    const { error } = await table().upsert(
      keep.map((r) => ({
        tenant_id: tenantId,
        provider: PROVIDER,
        account_code: r.accountCode,
        external_account_id: r.externalAccountId,
        external_account_name: r.externalAccountName,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "tenant_id,provider,account_code" },
    );
    if (error) throw new Error(error.message);
  }
  if (drop.length > 0) {
    const { error } = await table().delete().eq("tenant_id", tenantId).eq("provider", PROVIDER).in("account_code", drop);
    if (error) throw new Error(error.message);
  }
}

export { suggestMappings };
