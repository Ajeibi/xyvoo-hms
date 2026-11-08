import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/*
 * One row per hotel and kind of integration in hotel.integration_connections. The readable part
 * (`config`) holds choices; anything secret (logins, tokens) is encrypted into `credentials_encrypted`
 * and only the server ever reads it. Every call to a provider is noted in hotel.integration_events.
 */

export type IntegrationKind = "lock" | "id_reader" | "payment";

export type IntegrationConnection<C = Record<string, unknown>, S = Record<string, unknown>> = {
  id: string;
  kind: IntegrationKind;
  provider: string;
  status: "active" | "paused" | "error";
  config: C;
  secrets: S | null;
  lastTestedAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
};

type Row = {
  id: string;
  kind: IntegrationKind;
  provider: string;
  status: "active" | "paused" | "error";
  config: unknown;
  credentials_encrypted: string | null;
  last_tested_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

export function sealSecrets(secrets: Record<string, unknown>): string {
  return encryptSecret(JSON.stringify(secrets));
}

export function openSecrets<S>(sealed: string | null): S | null {
  if (!sealed) return null;
  try {
    return JSON.parse(decryptSecret(sealed)) as S;
  } catch {
    return null;
  }
}

export async function loadConnection<C = Record<string, unknown>, S = Record<string, unknown>>(
  db: SupabaseClient,
  tenantId: string,
  kind: IntegrationKind,
): Promise<IntegrationConnection<C, S> | null> {
  const { data, error } = await db
    .schema("hotel")
    .from("integration_connections")
    .select("id,kind,provider,status,config,credentials_encrypted,last_tested_at,last_error,last_error_at")
    .eq("tenant_id", tenantId)
    .eq("kind", kind)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as Row;
  return {
    id: r.id,
    kind: r.kind,
    provider: r.provider,
    status: r.status,
    config: ((r.config && typeof r.config === "object" ? r.config : {}) as C),
    secrets: openSecrets<S>(r.credentials_encrypted),
    lastTestedAt: r.last_tested_at,
    lastError: r.last_error,
    lastErrorAt: r.last_error_at,
  };
}

export async function saveConnection(
  db: SupabaseClient,
  input: {
    tenantId: string;
    kind: IntegrationKind;
    provider: string;
    config: Record<string, unknown>;
    /** Leave undefined to keep the stored secrets; pass an object to replace them. */
    secrets?: Record<string, unknown> | null;
    userId?: string | null;
  },
): Promise<{ error?: string }> {
  const row: Record<string, unknown> = {
    tenant_id: input.tenantId,
    kind: input.kind,
    provider: input.provider,
    config: input.config,
    status: "active",
    updated_at: new Date().toISOString(),
  };
  if (input.secrets !== undefined) row.credentials_encrypted = input.secrets ? sealSecrets(input.secrets) : null;
  if (input.userId) row.created_by = input.userId;
  const { error } = await db.schema("hotel").from("integration_connections").upsert(row, { onConflict: "tenant_id,kind" });
  if (error) {
    if (error.code === "42P01") return { error: "Integrations are not set up yet. Apply the integrations migration." };
    return { error: "Could not save the connection." };
  }
  return {};
}

export async function recordTestResult(db: SupabaseClient, tenantId: string, kind: IntegrationKind, error: string | null) {
  const now = new Date().toISOString();
  await db
    .schema("hotel")
    .from("integration_connections")
    .update(
      error
        ? { last_tested_at: now, last_error: error.slice(0, 300), last_error_at: now, status: "error", updated_at: now }
        : { last_tested_at: now, last_error: null, last_error_at: null, status: "active", updated_at: now },
    )
    .eq("tenant_id", tenantId)
    .eq("kind", kind);
}

/** Notes one call to a provider. Never throws and never records secrets or door codes. */
export async function logIntegrationEvent(
  db: SupabaseClient,
  e: { tenantId: string; kind: IntegrationKind; provider: string; action: string; ok: boolean; error?: string | null; startedAt?: number; ref?: string | null },
) {
  try {
    await db
      .schema("hotel")
      .from("integration_events")
      .insert({
        tenant_id: e.tenantId,
        kind: e.kind,
        provider: e.provider,
        action: e.action,
        ok: e.ok,
        error: e.error ? e.error.slice(0, 300) : null,
        duration_ms: e.startedAt ? Math.max(0, Date.now() - e.startedAt) : null,
        ref: e.ref ?? null,
      });
  } catch {
    /* the log is a convenience; it must never break a door or a payment */
  }
}

export type IntegrationEventRow = {
  id: number;
  kind: string;
  provider: string;
  action: string;
  ok: boolean;
  error: string | null;
  createdAt: string;
};

export async function recentIntegrationEvents(db: SupabaseClient, tenantId: string, limit = 15): Promise<IntegrationEventRow[]> {
  const { data } = await db
    .schema("hotel")
    .from("integration_events")
    .select("id,kind,provider,action,ok,error,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as { id: number; kind: string; provider: string; action: string; ok: boolean; error: string | null; created_at: string }[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    provider: r.provider,
    action: r.action,
    ok: r.ok,
    error: r.error,
    createdAt: r.created_at,
  }));
}
