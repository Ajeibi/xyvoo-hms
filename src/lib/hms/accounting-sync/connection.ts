import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import type { ExternalBusiness, TokenSet } from "@/lib/hms/accounting-sync/driver";
import type { StoredTokens, TokenStore } from "@/lib/hms/accounting-sync/tokens";

export const PROVIDER = "sage_accounting" as const;

export type ConnectionStatus = "connected" | "needs_reauth" | "disconnected" | "pending_business";

/** Everything the browser may see. Tokens are never part of this. */
export type PublicConnection = {
  status: ConnectionStatus;
  businessId: string | null;
  businessName: string | null;
  currency: string | null;
  syncFrom: string;
  connectedAt: string | null;
  lastError: string | null;
  pendingBusinesses: ExternalBusiness[] | null;
};

type ConnectionRow = {
  id: string;
  tenant_id: string;
  status: ConnectionStatus;
  external_business_id: string | null;
  external_business_name: string | null;
  external_currency: string | null;
  pending_businesses: ExternalBusiness[] | null;
  access_token_enc: string | null;
  refresh_token_enc: string | null;
  access_expires_at: string | null;
  sync_from: string;
  connected_at: string | null;
  last_error: string | null;
};

const COLUMNS =
  "id,tenant_id,status,external_business_id,external_business_name,external_currency,pending_businesses,access_token_enc,refresh_token_enc,access_expires_at,sync_from,connected_at,last_error";

export async function getConnectionRow(service: SupabaseClient, tenantId: string): Promise<ConnectionRow | null> {
  const { data } = await service
    .schema("hotel")
    .from("accounting_connections")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  return (data as ConnectionRow | null) ?? null;
}

export function toPublicConnection(row: ConnectionRow | null): PublicConnection | null {
  if (!row) return null;
  return {
    status: row.status,
    businessId: row.external_business_id,
    businessName: row.external_business_name,
    currency: row.external_currency,
    syncFrom: row.sync_from,
    connectedAt: row.connected_at,
    lastError: row.last_error,
    pendingBusinesses: row.pending_businesses,
  };
}

function tokenColumns(tokens: TokenSet, now: Date) {
  return {
    access_token_enc: encryptSecret(tokens.accessToken),
    refresh_token_enc: encryptSecret(tokens.refreshToken),
    access_expires_at: new Date(now.getTime() + tokens.expiresIn * 1000).toISOString(),
    refresh_expires_at: tokens.refreshExpiresIn ? new Date(now.getTime() + tokens.refreshExpiresIn * 1000).toISOString() : null,
  };
}

/** Called after the OAuth callback: stores the tokens and either activates the business or asks the user to pick one. */
export async function saveNewConnection(
  service: SupabaseClient,
  params: { tenantId: string; userId: string; tokens: TokenSet; businesses: ExternalBusiness[]; syncFrom: string },
): Promise<{ status: "connected" | "pending_business" }> {
  const now = new Date();
  const single = params.businesses.length === 1 ? params.businesses[0] : null;
  const row = {
    tenant_id: params.tenantId,
    provider: PROVIDER,
    status: single ? "connected" : "pending_business",
    external_business_id: single?.id ?? null,
    external_business_name: single?.name ?? null,
    external_currency: single?.currency ?? null,
    pending_businesses: single ? null : params.businesses,
    sync_from: params.syncFrom,
    connected_by: params.userId,
    connected_at: single ? now.toISOString() : null,
    last_error: null,
    refresh_lock_until: null,
    updated_at: now.toISOString(),
    ...tokenColumns(params.tokens, now),
  };
  const { error } = await service.schema("hotel").from("accounting_connections").upsert(row, { onConflict: "tenant_id,provider" });
  if (error) throw new Error(error.message);
  return { status: single ? "connected" : "pending_business" };
}

export async function chooseBusiness(
  service: SupabaseClient,
  tenantId: string,
  businessId: string,
): Promise<{ ok: true; business: ExternalBusiness } | { ok: false; error: string }> {
  const row = await getConnectionRow(service, tenantId);
  if (!row || row.status !== "pending_business") return { ok: false, error: "There is no business to pick." };
  const business = (row.pending_businesses ?? []).find((b) => b.id === businessId);
  if (!business) return { ok: false, error: "That business is not on this Sage login." };
  const { error } = await service
    .schema("hotel")
    .from("accounting_connections")
    .update({
      status: "connected",
      external_business_id: business.id,
      external_business_name: business.name,
      external_currency: business.currency,
      pending_businesses: null,
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER);
  if (error) return { ok: false, error: error.message };
  return { ok: true, business };
}

export async function setSyncFrom(service: SupabaseClient, tenantId: string, syncFrom: string) {
  return service
    .schema("hotel")
    .from("accounting_connections")
    .update({ sync_from: syncFrom, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER);
}

/** Forgets the tokens and stops queueing. Returns the refresh token (if any) so the caller can revoke it at Sage. */
export async function markDisconnected(service: SupabaseClient, tenantId: string): Promise<string | null> {
  const row = await getConnectionRow(service, tenantId);
  let refresh: string | null = null;
  try {
    refresh = row?.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null;
  } catch {
    refresh = null;
  }
  await service
    .schema("hotel")
    .from("accounting_connections")
    .update({
      status: "disconnected",
      access_token_enc: null,
      refresh_token_enc: null,
      access_expires_at: null,
      refresh_expires_at: null,
      pending_businesses: null,
      refresh_lock_until: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("provider", PROVIDER);
  return refresh;
}

/** TokenStore backed by the connection row; tokens are decrypted only in memory. */
export function createTokenStore(service: SupabaseClient, tenantId: string): TokenStore {
  const table = () => service.schema("hotel").from("accounting_connections");
  return {
    async load(): Promise<StoredTokens | null> {
      const row = await getConnectionRow(service, tenantId);
      if (!row) return null;
      try {
        return {
          status: row.status,
          accessToken: row.access_token_enc ? decryptSecret(row.access_token_enc) : null,
          refreshToken: row.refresh_token_enc ? decryptSecret(row.refresh_token_enc) : null,
          accessExpiresAt: row.access_expires_at ? new Date(row.access_expires_at) : null,
        };
      } catch {
        return { status: "needs_reauth", accessToken: null, refreshToken: null, accessExpiresAt: null };
      }
    },
    async tryLock(untilIso) {
      const { data } = await table()
        .update({ refresh_lock_until: untilIso })
        .eq("tenant_id", tenantId)
        .eq("provider", PROVIDER)
        .or(`refresh_lock_until.is.null,refresh_lock_until.lt.${new Date().toISOString()}`)
        .select("id");
      return (data ?? []).length > 0;
    },
    async save(tokens, now) {
      const { error } = await table()
        .update({ ...tokenColumns(tokens, now), refresh_lock_until: null, last_error: null, updated_at: now.toISOString() })
        .eq("tenant_id", tenantId)
        .eq("provider", PROVIDER);
      if (error) throw new Error(error.message);
    },
    async releaseLock() {
      await table().update({ refresh_lock_until: null }).eq("tenant_id", tenantId).eq("provider", PROVIDER);
    },
    async markNeedsReauth(message) {
      await table()
        .update({ status: "needs_reauth", last_error: message, refresh_lock_until: null, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("provider", PROVIDER);
    },
  };
}
