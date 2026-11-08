import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveLockProvider, issueStayCode, legacySetup, revokeStayCodes, unlockRoomLock } from "../locks/service";
import { lockForRoom } from "../locks/service";
import type { SmartLockResult, SmartLockTenantConfig } from "./types";

/*
 * The functions the front desk routes already call (remote unlock, key reissue, revoke at check-out).
 * They keep their signatures; what they do is now decided by the hotel's chosen lock brand in
 * ../locks (TTLock, the hotel's own server, demo, or record-only). Every one still writes the
 * room_key_events audit row. Door codes never appear in a message, because messages are shown in
 * notifications; staff read a code from the Door locks screen.
 */

export function getSmartLockConfig(tenant: { smart_lock_setup?: unknown }): SmartLockTenantConfig {
  const s = legacySetup(tenant.smart_lock_setup);
  return { provider: s.providerId, apiBaseUrl: s.config.apiBaseUrl, apiKey: s.secrets?.apiKey };
}

type Common = {
  supabase: SupabaseClient;
  tenantId: string;
  tenant: { smart_lock_setup?: unknown };
  roomUnitId: string;
  roomCode: string;
  staffUserId: string;
};

const RECORD_ONLY = "Recorded only. Connect a door lock system in Settings to act on the door.";

export async function executeRemoteUnlock(params: Common & { reason: string }): Promise<SmartLockResult> {
  const { providerId, provider } = await resolveLockProvider(params.supabase, params.tenantId, params.tenant.smart_lock_setup);

  let result: SmartLockResult;
  if (!provider) {
    result = { mode: providerId, executed: false, message: `Unlock ${RECORD_ONLY.toLowerCase()}` };
  } else {
    const r = await unlockRoomLock({
      db: params.supabase,
      tenantId: params.tenantId,
      roomUnitId: params.roomUnitId,
      roomCode: params.roomCode,
      legacyRaw: params.tenant.smart_lock_setup,
    });
    result = r.ok
      ? { mode: providerId, executed: true, message: providerId === "mock" ? "Mock unlock: door signal simulated." : "Unlock sent to the lock." }
      : { mode: providerId, executed: false, message: r.error };
  }

  await params.supabase.schema("hotel").from("room_key_events").insert({
    tenant_id: params.tenantId,
    room_unit_id: params.roomUnitId,
    event_type: "remote_unlock",
    reason: params.reason,
    staff_user_id: params.staffUserId,
    metadata: { roomCode: params.roomCode, providerMode: result.mode, executed: result.executed },
  });

  return result;
}

/** Ends a guest's access at check-out: cancels the stay's door codes at the lock. */
export async function executeKeyRevoke(params: Common & { reservationId?: string }): Promise<SmartLockResult> {
  const { providerId, provider } = await resolveLockProvider(params.supabase, params.tenantId, params.tenant.smart_lock_setup);

  let result: SmartLockResult;
  if (!provider) {
    result = { mode: providerId, executed: false, message: "Key revoke recorded (audit only)." };
  } else if (!params.reservationId) {
    result = { mode: providerId, executed: false, message: "No booking given, so no door codes were cancelled." };
  } else {
    const r = await revokeStayCodes({
      db: params.supabase,
      tenantId: params.tenantId,
      reservationId: params.reservationId,
      legacyRaw: params.tenant.smart_lock_setup,
    });
    if (r.revoked === 0 && r.failed === 0 && providerId === "http_webhook") {
      // The hotel's own server keeps no codes of ours; tell it the room is vacated, as before.
      const map = await lockForRoom(params.supabase, params.tenantId, params.roomUnitId, { providerId, roomCode: params.roomCode });
      const x = await provider.revokeCode({ externalLockId: map?.externalLockId ?? params.roomCode, externalCodeId: null });
      result = { mode: providerId, executed: x.ok, message: x.ok ? "Revoke sent to the lock server." : x.error };
    } else if (r.failed > 0) {
      result = { mode: providerId, executed: false, message: `${r.failed} door code(s) could not be cancelled at the lock. They will be retried.`, metadata: { failed: r.failed } };
    } else {
      result = { mode: providerId, executed: true, message: r.revoked > 0 ? `${r.revoked} door code(s) cancelled.` : "No live door codes for this stay." };
    }
  }

  await params.supabase.schema("hotel").from("room_key_events").insert({
    tenant_id: params.tenantId,
    room_unit_id: params.roomUnitId,
    reservation_id: params.reservationId ?? null,
    event_type: "key_deactivated",
    reason: "Checked out",
    staff_user_id: params.staffUserId,
    metadata: { providerMode: result.mode, executed: result.executed, trigger: "checkout" },
  });

  return result;
}

/** Cancels the stay's old door codes and makes a fresh one. The new code is read from the Door locks screen. */
export async function executeKeyReissue(params: Common & { reason: string; reservationId?: string; reissueCount: number }): Promise<SmartLockResult> {
  const { providerId, provider } = await resolveLockProvider(params.supabase, params.tenantId, params.tenant.smart_lock_setup);

  await params.supabase.schema("hotel").from("room_key_events").insert({
    tenant_id: params.tenantId,
    room_unit_id: params.roomUnitId,
    reservation_id: params.reservationId ?? null,
    event_type: "key_deactivated",
    reason: `Deactivate prior keys: ${params.reason}`,
    staff_user_id: params.staffUserId,
    metadata: { providerMode: providerId },
  });

  let result: SmartLockResult;
  if (!provider) {
    result = { mode: providerId, executed: false, message: "Key reissue recorded (audit only)." };
  } else if (!params.reservationId) {
    result = { mode: providerId, executed: false, message: "No booking given, so no new door code was made." };
  } else {
    const r = await issueStayCode({
      db: params.supabase,
      tenantId: params.tenantId,
      reservationId: params.reservationId,
      roomUnitId: params.roomUnitId,
      roomCode: params.roomCode,
      staffUserId: params.staffUserId,
      legacyRaw: params.tenant.smart_lock_setup,
    });
    result = {
      mode: providerId,
      executed: r.ok,
      message: r.ok ? "New door code made. Open Door locks to read it to the guest." : r.message,
    };
  }

  await params.supabase.schema("hotel").from("room_key_events").insert({
    tenant_id: params.tenantId,
    room_unit_id: params.roomUnitId,
    reservation_id: params.reservationId ?? null,
    event_type: "key_reissued",
    reason: params.reason,
    staff_user_id: params.staffUserId,
    metadata: { count: params.reissueCount, providerMode: result.mode, executed: result.executed },
  });

  return result;
}
