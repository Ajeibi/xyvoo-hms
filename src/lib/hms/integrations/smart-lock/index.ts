import type { SupabaseClient } from "@supabase/supabase-js";
import type { SmartLockResult, SmartLockTenantConfig } from "./types";

function parseSmartLockConfig(raw: unknown): SmartLockTenantConfig {
  if (!raw || typeof raw !== "object") return { provider: "audit_only" };
  const o = raw as Record<string, unknown>;
  const provider =
    o.provider === "mock" || o.provider === "http_webhook" || o.provider === "audit_only"
      ? o.provider
      : "audit_only";
  return {
    provider,
    apiBaseUrl: typeof o.apiBaseUrl === "string" ? o.apiBaseUrl : undefined,
    apiKey: typeof o.apiKey === "string" ? o.apiKey : undefined,
    roomIdMap:
      o.roomIdMap && typeof o.roomIdMap === "object"
        ? (o.roomIdMap as Record<string, string>)
        : undefined,
  };
}

export function getSmartLockConfig(tenant: { smart_lock_setup?: unknown }): SmartLockTenantConfig {
  return parseSmartLockConfig(tenant.smart_lock_setup);
}

async function httpWebhookUnlock(
  config: SmartLockTenantConfig,
  roomUnitId: string,
  roomCode: string,
  reason: string,
): Promise<SmartLockResult> {
  if (!config.apiBaseUrl) {
    return {
      mode: "http_webhook",
      executed: false,
      message: "Smart lock webhook URL not configured.",
    };
  }
  const externalId = config.roomIdMap?.[roomUnitId] ?? roomCode;
  try {
    const res = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/unlock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({ roomId: externalId, roomCode, reason }),
    });
    if (!res.ok) {
      return {
        mode: "http_webhook",
        executed: false,
        message: `Lock provider returned ${res.status}.`,
        metadata: { status: res.status },
      };
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      mode: "http_webhook",
      executed: true,
      message: "Unlock sent to lock provider.",
      metadata: data,
    };
  } catch {
    return {
      mode: "http_webhook",
      executed: false,
      message: "Could not reach lock provider.",
    };
  }
}

export async function executeRemoteUnlock(params: {
  supabase: SupabaseClient;
  tenantId: string;
  tenant: { smart_lock_setup?: unknown };
  roomUnitId: string;
  roomCode: string;
  reason: string;
  staffUserId: string;
}): Promise<SmartLockResult> {
  const config = getSmartLockConfig(params.tenant);
  const mode = config.provider ?? "audit_only";

  let result: SmartLockResult;
  if (mode === "mock") {
    result = {
      mode: "mock",
      executed: true,
      message: "Mock unlock: door signal simulated.",
    };
  } else if (mode === "http_webhook") {
    result = await httpWebhookUnlock(config, params.roomUnitId, params.roomCode, params.reason);
  } else {
    result = {
      mode: "audit_only",
      executed: false,
      message: "Unlock recorded (audit only). Configure smart lock in Settings to execute remotely.",
    };
  }

  await params.supabase.schema("hotel").from("room_key_events").insert({
    tenant_id: params.tenantId,
    room_unit_id: params.roomUnitId,
    event_type: "remote_unlock",
    reason: params.reason,
    staff_user_id: params.staffUserId,
    metadata: {
      roomCode: params.roomCode,
      providerMode: result.mode,
      executed: result.executed,
      ...result.metadata,
    },
  });

  return result;
}

export async function executeKeyReissue(params: {
  supabase: SupabaseClient;
  tenantId: string;
  tenant: { smart_lock_setup?: unknown };
  roomUnitId: string;
  roomCode: string;
  reason: string;
  staffUserId: string;
  reservationId?: string;
  reissueCount: number;
}): Promise<SmartLockResult> {
  const config = getSmartLockConfig(params.tenant);
  const mode = config.provider ?? "audit_only";

  await params.supabase.schema("hotel").from("room_key_events").insert({
    tenant_id: params.tenantId,
    room_unit_id: params.roomUnitId,
    reservation_id: params.reservationId ?? null,
    event_type: "key_deactivated",
    reason: `Deactivate prior keys: ${params.reason}`,
    staff_user_id: params.staffUserId,
    metadata: { providerMode: mode },
  });

  let result: SmartLockResult;
  if (mode === "mock") {
    result = {
      mode: "mock",
      executed: true,
      message: `Mock reissue: ${params.reissueCount} key(s) issued.`,
    };
  } else if (mode === "http_webhook" && config.apiBaseUrl) {
    try {
      const res = await fetch(`${config.apiBaseUrl.replace(/\/$/, "")}/reissue`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        },
        body: JSON.stringify({
          roomId: config.roomIdMap?.[params.roomUnitId] ?? params.roomCode,
          count: params.reissueCount,
          reason: params.reason,
        }),
      });
      result = {
        mode: "http_webhook",
        executed: res.ok,
        message: res.ok ? "Reissue sent to lock provider." : `Provider returned ${res.status}.`,
      };
    } catch {
      result = {
        mode: "http_webhook",
        executed: false,
        message: "Could not reach lock provider for reissue.",
      };
    }
  } else {
    result = {
      mode: "audit_only",
      executed: false,
      message: "Key reissue recorded (audit only).",
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
