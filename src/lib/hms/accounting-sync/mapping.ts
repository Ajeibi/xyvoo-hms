import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExternalAccount } from "@/lib/hms/accounting-sync/driver";
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

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Suggests a Sage ledger account for each XYVOO account: same account number first, then same name,
 * then one name containing the other. Never overwrites an existing mapping and never reuses a Sage account
 * that is already taken. Pure, so it runs in the browser too.
 */
export function suggestMappings(
  accounts: { code: string; name: string }[],
  external: ExternalAccount[],
  existing: Record<string, string>,
): Record<string, ExternalAccount> {
  const out: Record<string, ExternalAccount> = {};
  const used = new Set(Object.values(existing));
  const byCode = new Map(external.filter((e) => e.code).map((e) => [String(e.code).trim(), e]));
  const byName = new Map(external.map((e) => [norm(e.name), e]));

  for (const a of accounts) {
    if (existing[a.code]) continue;
    const name = norm(a.name);
    const candidates = [
      byCode.get(a.code.trim()),
      byName.get(name),
      name.length >= 4 ? external.find((e) => norm(e.name).includes(name) || name.includes(norm(e.name))) : undefined,
    ];
    const hit = candidates.find((c) => c && !used.has(c.id));
    if (hit) {
      out[a.code] = hit;
      used.add(hit.id);
    }
  }
  return out;
}
