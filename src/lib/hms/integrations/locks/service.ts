import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { loadConnection, logIntegrationEvent, recordTestResult, saveConnection } from "../connections";
import type { FetchLike } from "../http-fetch";
import { createHttpLockProvider, createMockLockProvider } from "./adapters/simple";
import { createTtlockProvider, type TtlockTokens } from "./adapters/ttlock";
import { codeWindow, generateDoorCode } from "./code";
import { LOCK_PROVIDER_IDS, type LockConnectionConfig, type LockProvider, type LockProviderId, type LockResult } from "./types";

/*
 * The only door in to the lock adapters. Everything else in the app (key issue, key reissue, check-out
 * revoke, remote unlock) goes through `resolveLockProvider` and the functions below, so a new brand is
 * one adapter file plus one line in `buildLockProvider`.
 */

type LockSecrets = { tokens?: TtlockTokens; apiKey?: string };

export type LockSetup = {
  providerId: LockProviderId;
  config: LockConnectionConfig;
  secrets: LockSecrets | null;
};

/** The old tenant-level setting, still honoured until a hotel saves a connection. */
export function legacySetup(raw: unknown): LockSetup {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const id = (LOCK_PROVIDER_IDS as readonly string[]).includes(String(o.provider)) ? (o.provider as LockProviderId) : "audit_only";
  return {
    providerId: id === "ttlock" ? "audit_only" : id,
    config: { apiBaseUrl: typeof o.apiBaseUrl === "string" ? o.apiBaseUrl : undefined },
    secrets: typeof o.apiKey === "string" ? { apiKey: o.apiKey } : null,
  };
}

/** Builds the adapter for a setup. Returns null when the setup records only (no hardware). Pure apart from `fetchImpl`. */
export function buildLockProvider(
  setup: LockSetup,
  deps: { fetchImpl?: FetchLike; onTokens?: (t: TtlockTokens) => Promise<void> | void; now?: () => number } = {},
): LockProvider | null {
  switch (setup.providerId) {
    case "mock":
      return createMockLockProvider();
    case "http_webhook":
      return setup.config.apiBaseUrl
        ? createHttpLockProvider({ apiBaseUrl: setup.config.apiBaseUrl, apiKey: setup.secrets?.apiKey, fetchImpl: deps.fetchImpl })
        : null;
    case "ttlock":
      return createTtlockProvider({
        tokens: setup.secrets?.tokens ?? null,
        hasGateway: setup.config.hasGateway === true,
        fetchImpl: deps.fetchImpl,
        onTokens: deps.onTokens,
        now: deps.now,
      });
    case "audit_only":
      return null;
  }
}

export type ResolvedLocks = { providerId: LockProviderId; provider: LockProvider | null };

let testFetch: FetchLike | undefined;
/** Tests put a fake `fetch` here so the adapters never touch the network. */
export function setLockFetchForTests(f: FetchLike | undefined) {
  testFetch = f;
}

export async function resolveLockProvider(db: SupabaseClient, tenantId: string, legacyRaw?: unknown): Promise<ResolvedLocks> {
  const conn = await loadConnection<LockConnectionConfig, LockSecrets>(db, tenantId, "lock");
  let setup: LockSetup;
  if (conn && (LOCK_PROVIDER_IDS as readonly string[]).includes(conn.provider)) {
    setup = { providerId: conn.provider as LockProviderId, config: conn.config, secrets: conn.secrets };
  } else {
    setup = legacySetup(legacyRaw);
  }
  const provider = buildLockProvider(setup, {
    fetchImpl: testFetch,
    // A refreshed login is written straight back so the next call starts from it.
    onTokens: async (tokens) => {
      await saveConnection(db, { tenantId, kind: "lock", provider: setup.providerId, config: setup.config, secrets: { ...setup.secrets, tokens } });
    },
  });
  return { providerId: setup.providerId, provider };
}

/** Wraps a provider call so every attempt is logged (no codes, no secrets). */
async function logged<T>(
  db: SupabaseClient,
  tenantId: string,
  providerId: string,
  action: string,
  ref: string | null,
  run: () => Promise<LockResult<T>>,
): Promise<LockResult<T>> {
  const startedAt = Date.now();
  const r = await run();
  await logIntegrationEvent(db, { tenantId, kind: "lock", provider: providerId, action, ok: r.ok, error: r.ok ? null : r.error, startedAt, ref });
  return r;
}

export type LockMap = { roomUnitId: string; externalLockId: string; label: string | null; battery: number | null };

export async function listLockMaps(db: SupabaseClient, tenantId: string): Promise<LockMap[]> {
  const { data } = await db
    .schema("hotel")
    .from("lock_room_maps")
    .select("room_unit_id,external_lock_id,lock_label,battery_percent")
    .eq("tenant_id", tenantId);
  return ((data ?? []) as { room_unit_id: string; external_lock_id: string; lock_label: string | null; battery_percent: number | null }[]).map((r) => ({
    roomUnitId: r.room_unit_id,
    externalLockId: r.external_lock_id,
    label: r.lock_label,
    battery: r.battery_percent,
  }));
}

/** The lock matched to a room. A hotel's own lock server (http_webhook) may use the room code instead of a match. */
export async function lockForRoom(
  db: SupabaseClient,
  tenantId: string,
  roomUnitId: string,
  fallback?: { providerId: LockProviderId; roomCode: string },
): Promise<LockMap | null> {
  const found = await lockForRoomExact(db, tenantId, roomUnitId);
  if (found) return found;
  if (fallback?.providerId === "http_webhook") return { roomUnitId, externalLockId: fallback.roomCode, label: null, battery: null };
  return null;
}

async function lockForRoomExact(db: SupabaseClient, tenantId: string, roomUnitId: string): Promise<LockMap | null> {
  const { data } = await db
    .schema("hotel")
    .from("lock_room_maps")
    .select("room_unit_id,external_lock_id,lock_label,battery_percent")
    .eq("tenant_id", tenantId)
    .eq("room_unit_id", roomUnitId)
    .maybeSingle();
  if (!data) return null;
  const r = data as { room_unit_id: string; external_lock_id: string; lock_label: string | null; battery_percent: number | null };
  return { roomUnitId: r.room_unit_id, externalLockId: r.external_lock_id, label: r.lock_label, battery: r.battery_percent };
}

export async function testLockConnection(db: SupabaseClient, tenantId: string, legacyRaw?: unknown): Promise<LockResult<{ lockCount: number }>> {
  const { providerId, provider } = await resolveLockProvider(db, tenantId, legacyRaw);
  if (!provider) return { ok: false, error: "No lock system is connected. Choose one first.", retryable: false };
  const r = await logged(db, tenantId, providerId, "test", null, () => provider.testConnection());
  await recordTestResult(db, tenantId, "lock", r.ok ? null : r.error);
  return r;
}

/** Reads the brand's lock list and notes each lock's battery on rooms that are matched. */
export async function refreshLockBatteries(db: SupabaseClient, tenantId: string, legacyRaw?: unknown) {
  const { providerId, provider } = await resolveLockProvider(db, tenantId, legacyRaw);
  if (!provider) return { updated: 0, low: [] as { roomUnitId: string; battery: number }[] };
  const r = await logged(db, tenantId, providerId, "battery", null, () => provider.listLocks());
  if (!r.ok) return { updated: 0, low: [] };
  const maps = await listLockMaps(db, tenantId);
  const byLock = new Map(r.data.locks.map((l) => [l.externalLockId, l]));
  let updated = 0;
  const low: { roomUnitId: string; battery: number }[] = [];
  for (const m of maps) {
    const l = byLock.get(m.externalLockId);
    if (!l || l.battery === null) continue;
    await db
      .schema("hotel")
      .from("lock_room_maps")
      .update({ battery_percent: l.battery, battery_checked_at: new Date().toISOString(), lock_label: l.label })
      .eq("tenant_id", tenantId)
      .eq("room_unit_id", m.roomUnitId);
    updated++;
    if (l.battery <= LOW_BATTERY_PERCENT) low.push({ roomUnitId: m.roomUnitId, battery: l.battery });
  }
  return { updated, low };
}

export const LOW_BATTERY_PERCENT = 20;

export type StayCodeResult =
  | { ok: true; message: string; code: string | null; startsAt: string; endsAt: string }
  | { ok: false; message: string; retryable: boolean };

/**
 * Makes (or remakes) the door code for a stay. Old live codes for the stay are cancelled first. The code is
 * returned to the caller once and kept encrypted; it is never put in a message, log or notification.
 */
export async function issueStayCode(params: {
  db: SupabaseClient;
  tenantId: string;
  reservationId: string;
  roomUnitId: string;
  roomCode?: string;
  staffUserId: string | null;
  legacyRaw?: unknown;
  now?: Date;
}): Promise<StayCodeResult> {
  const { db, tenantId } = params;
  const { providerId, provider } = await resolveLockProvider(db, tenantId, params.legacyRaw);
  if (!provider) return { ok: false, message: "Door codes need a lock system. None is connected, so nothing was sent to a door.", retryable: false };
  const map = await lockForRoom(db, tenantId, params.roomUnitId, { providerId, roomCode: params.roomCode ?? params.roomUnitId });
  if (!map) return { ok: false, message: "This room has no lock matched to it yet. Match it in Settings, Door locks.", retryable: false };

  const { data: stay } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,status,arrival_at,departure_at,confirmation_code,room_unit_id")
    .eq("tenant_id", tenantId)
    .eq("id", params.reservationId)
    .maybeSingle();
  if (!stay) return { ok: false, message: "Booking not found.", retryable: false };
  const s = stay as { status: string; arrival_at: string; departure_at: string; confirmation_code: string };
  if (s.status !== "checked_in" && s.status !== "confirmed") return { ok: false, message: "Door codes are only made for confirmed or checked-in stays.", retryable: false };

  const revoked = await revokeStayCodes({ db, tenantId, reservationId: params.reservationId, legacyRaw: params.legacyRaw });
  if (revoked.failed > 0) {
    return { ok: false, message: "The old code could not be cancelled at the lock, so a new one was not made. Try again in a minute.", retryable: true };
  }

  const win = codeWindow({ arrivalAt: new Date(s.arrival_at), departureAt: new Date(s.departure_at), now: params.now });
  const result = await logged(db, tenantId, providerId, "issue_code", params.reservationId, () =>
    provider.issueCode({
      externalLockId: map.externalLockId,
      code: generateDoorCode(6),
      startsAt: win.startsAt,
      endsAt: win.endsAt,
      label: `Stay ${s.confirmation_code}`,
    }),
  );
  if (!result.ok) return { ok: false, message: result.error, retryable: result.retryable };

  const { error } = await db.schema("hotel").from("lock_codes").insert({
    tenant_id: tenantId,
    reservation_id: params.reservationId,
    room_unit_id: params.roomUnitId,
    provider: providerId,
    external_lock_id: map.externalLockId,
    external_code_id: result.data.externalCodeId,
    code_encrypted: encryptSecret(result.data.code),
    starts_at: win.startsAt.toISOString(),
    ends_at: win.endsAt.toISOString(),
    created_by: params.staffUserId,
  });
  if (error) {
    // The code exists at the lock but we could not remember it: cancel it so no unknown code stays live.
    await provider.revokeCode({ externalLockId: map.externalLockId, externalCodeId: result.data.externalCodeId });
    return { ok: false, message: "The code was made but could not be saved, so it was cancelled. Apply the integrations migration and try again.", retryable: false };
  }
  return { ok: true, message: "Door code created.", code: result.data.code, startsAt: win.startsAt.toISOString(), endsAt: win.endsAt.toISOString() };
}

/** Cancels every live code for a stay at the lock. A code that cannot be cancelled stays flagged for a retry. */
export async function revokeStayCodes(params: {
  db: SupabaseClient;
  tenantId: string;
  reservationId: string;
  legacyRaw?: unknown;
}): Promise<{ revoked: number; failed: number }> {
  const { db, tenantId } = params;
  const { data } = await db
    .schema("hotel")
    .from("lock_codes")
    .select("id,external_lock_id,external_code_id")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", params.reservationId)
    .in("status", ["active", "revoke_failed"]);
  return cancelCodes(db, tenantId, (data ?? []) as CodeRow[], params.legacyRaw);
}

type CodeRow = { id: string; external_lock_id: string; external_code_id: string | null };

async function cancelCodes(db: SupabaseClient, tenantId: string, rows: CodeRow[], legacyRaw?: unknown) {
  if (rows.length === 0) return { revoked: 0, failed: 0 };
  const { providerId, provider } = await resolveLockProvider(db, tenantId, legacyRaw);
  let revoked = 0;
  let failed = 0;
  for (const row of rows) {
    const r: LockResult = provider
      ? await logged(db, tenantId, providerId, "revoke_code", row.id, () => provider.revokeCode({ externalLockId: row.external_lock_id, externalCodeId: row.external_code_id }))
      : { ok: false, error: "No lock system is connected.", retryable: true };
    if (r.ok) {
      revoked++;
      await db.schema("hotel").from("lock_codes").update({ status: "revoked", revoked_at: new Date().toISOString(), revoke_error: null, code_encrypted: null }).eq("id", row.id);
    } else {
      failed++;
      await db.schema("hotel").from("lock_codes").update({ status: "revoke_failed", revoke_error: r.error.slice(0, 300) }).eq("id", row.id);
    }
  }
  return { revoked, failed };
}

/** Tries again for every code that could not be cancelled (a guest who left but whose code still works). */
export async function retryFailedRevokes(db: SupabaseClient, tenantId: string, legacyRaw?: unknown) {
  const { data } = await db
    .schema("hotel")
    .from("lock_codes")
    .select("id,external_lock_id,external_code_id")
    .eq("tenant_id", tenantId)
    .eq("status", "revoke_failed")
    .limit(100);
  return cancelCodes(db, tenantId, (data ?? []) as CodeRow[], legacyRaw);
}

/** Cancels codes whose stay is over but were never cancelled (belt and braces for a missed check-out). */
export async function sweepExpiredCodes(db: SupabaseClient, tenantId: string, legacyRaw?: unknown) {
  const { data } = await db
    .schema("hotel")
    .from("lock_codes")
    .select("id,external_lock_id,external_code_id")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .lt("ends_at", new Date(Date.now() - 24 * 3600000).toISOString())
    .limit(100);
  return cancelCodes(db, tenantId, (data ?? []) as CodeRow[], legacyRaw);
}

/** Shows staff the live code for a stay (decrypted on the server, on request only). */
export async function readStayCode(db: SupabaseClient, tenantId: string, reservationId: string): Promise<{ code: string; endsAt: string } | null> {
  const { data } = await db
    .schema("hotel")
    .from("lock_codes")
    .select("code_encrypted,ends_at")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { code_encrypted: string | null; ends_at: string } | null;
  if (!row?.code_encrypted) return null;
  try {
    return { code: decryptSecret(row.code_encrypted), endsAt: row.ends_at };
  } catch {
    return null;
  }
}

export async function unlockRoomLock(params: {
  db: SupabaseClient;
  tenantId: string;
  roomUnitId: string;
  roomCode?: string;
  legacyRaw?: unknown;
}): Promise<LockResult> {
  const { providerId, provider } = await resolveLockProvider(params.db, params.tenantId, params.legacyRaw);
  if (!provider) return { ok: false, error: "No lock system is connected.", retryable: false };
  const map = await lockForRoom(params.db, params.tenantId, params.roomUnitId, { providerId, roomCode: params.roomCode ?? params.roomUnitId });
  if (!map) return { ok: false, error: "This room has no lock matched to it yet.", retryable: false };
  return logged(params.db, params.tenantId, providerId, "unlock", params.roomUnitId, () => provider.remoteUnlock({ externalLockId: map.externalLockId }));
}
