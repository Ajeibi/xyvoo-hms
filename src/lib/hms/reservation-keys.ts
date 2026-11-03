import type { SupabaseClient } from "@supabase/supabase-js";

/* The desk's register of keys: issued against a stay, revoked by hand or automatically at check-out. */

export const KEY_TYPES = ["card", "fob", "digital"] as const;
export type KeyType = (typeof KEY_TYPES)[number];

export const KEY_TYPE_LABELS: Record<KeyType, string> = {
  card: "Key card",
  fob: "Key fob",
  digital: "Phone key",
};

/** Most keys that can be live on one stay at once. */
export const MAX_ACTIVE_KEYS = 6;

export type ReservationKey = {
  id: string;
  keyType: KeyType;
  label: string | null;
  status: "issued" | "revoked";
  issuedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
};

type KeyRow = {
  id: string;
  key_type: string;
  label: string | null;
  status: string;
  issued_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
};

export function mapKeyRow(r: KeyRow): ReservationKey {
  return {
    id: r.id,
    keyType: (KEY_TYPES as readonly string[]).includes(r.key_type) ? (r.key_type as KeyType) : "card",
    label: r.label,
    status: r.status === "revoked" ? "revoked" : "issued",
    issuedAt: r.issued_at,
    revokedAt: r.revoked_at,
    revokeReason: r.revoke_reason,
  };
}

export function countActiveKeys(keys: Pick<ReservationKey, "status">[]) {
  return keys.filter((k) => k.status === "issued").length;
}

/** Why a key can't be issued for this booking, or null if it can. */
export function keyIssueBlocker(input: { status: string; roomUnitId: string | null; activeKeys: number }): string | null {
  if (input.status !== "checked_in") return "Keys can only be issued once the guest is checked in.";
  if (!input.roomUnitId) return "Give the booking a room before issuing a key.";
  if (input.activeKeys >= MAX_ACTIVE_KEYS) return `This stay already has ${MAX_ACTIVE_KEYS} live keys. Revoke one first.`;
  return null;
}

export async function listReservationKeys(
  db: SupabaseClient,
  tenantId: string,
  reservationId: string,
): Promise<ReservationKey[]> {
  const { data, error } = await db
    .schema("hotel")
    .from("reservation_keys")
    .select("id,key_type,label,status,issued_at,revoked_at,revoke_reason")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .order("issued_at", { ascending: false });
  if (error || !data) return [];
  return (data as KeyRow[]).map(mapKeyRow);
}

/** Revokes every live key on a stay (used at check-out). Never throws; returns how many were revoked. */
export async function revokeAllKeys(
  db: SupabaseClient,
  input: { tenantId: string; reservationId: string; userId: string; reason: string },
): Promise<number> {
  try {
    const { data } = await db
      .schema("hotel")
      .from("reservation_keys")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: input.userId,
        revoke_reason: input.reason,
      })
      .eq("tenant_id", input.tenantId)
      .eq("reservation_id", input.reservationId)
      .eq("status", "issued")
      .select("id");
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}
