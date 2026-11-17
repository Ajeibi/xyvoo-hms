import type { SupabaseClient } from "@supabase/supabase-js";
import { rateLimitShared } from "@/lib/rate-limit";
import { attributionOf, setApprover } from "@/lib/hms/attribution";
import { recordAudit, lookupActorSnapshot } from "@/lib/hms/audit";
import { verifyPin } from "@/lib/hms/pin";

/*
 * Approval override. When a member of staff reaches something only a head of department may approve (a
 * discount over the limit, a void, a refund...), the head of department keys in their own PIN on the spot.
 * The PIN identifies the approver, so the log says who asked and who approved. Each PIN belongs to one
 * person in a hotel (it can't be set if someone else already uses it). The old shared manager PIN keeps
 * working until every hotel has set its heads' PINs; using it is logged too, but names nobody.
 */

export type PersonalApproval = { userId: string; name: string };

type PinRow = {
  user_id: string;
  role: string;
  department_role: string | null;
  staff_level: string | null;
  pin_hash: string | null;
};

/** Everyone in the hotel who has set a PIN and isn't suspended or locked out. */
async function pinHolders(service: SupabaseClient, tenantId: string): Promise<PinRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("memberships")
    .select("user_id, role, department_role, staff_level, pin_hash")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .is("pin_locked_at", null)
    .not("pin_hash", "is", null);
  if (error || !data) return [];
  return data as PinRow[];
}

/** The person this PIN belongs to, among all PINs set in the hotel (used to keep each PIN unique). */
export async function pinOwner(service: SupabaseClient, tenantId: string, pin: string, exceptUserId?: string): Promise<string | null> {
  for (const row of await pinHolders(service, tenantId)) {
    if (row.user_id !== exceptUserId && verifyPin(pin, row.pin_hash)) return row.user_id;
  }
  return null;
}

/**
 * Who, with this PIN, may approve for the signed-in person: any owner or admin, or a head of department
 * in the same department as the person asking. Returns null when the PIN matches nobody eligible.
 */
export async function verifyPersonalApproval(service: SupabaseClient, tenantId: string, pin: string): Promise<PersonalApproval | null> {
  const state = attributionOf(service);
  // Guessing a short PIN is the attack; slow it to a handful of tries per person every ten minutes.
  const limited = await rateLimitShared(`approval:${tenantId}:${state?.actor.userId ?? "anon"}`, 10, 10 * 60_000);
  if (!limited.ok) return null;

  const department = state?.actor.department ?? null;
  for (const row of await pinHolders(service, tenantId)) {
    const isAdmin = row.role === "owner" || row.role === "admin";
    const isHodOfSameDepartment = row.staff_level !== "staff" && Boolean(department) && row.department_role === department;
    if (!isAdmin && !isHodOfSameDepartment) continue;
    if (row.user_id === state?.actor.userId) continue; // you can't approve your own request
    if (!verifyPin(pin, row.pin_hash)) continue;
    const snapshot = await lookupActorSnapshot(service, tenantId, row.user_id).catch(() => null);
    const approver = { userId: row.user_id, name: snapshot?.name ?? "Manager" };
    setApprover(service, approver);
    await recordAudit(service, { tenantId, action: "approval_granted", entityType: "approval", entityId: row.user_id, approver });
    return approver;
  }
  return null;
}

/** Logs a PIN that matched nobody, so repeated guessing is visible in the activity log. */
export async function logFailedApproval(service: SupabaseClient, tenantId: string) {
  await recordAudit(service, { tenantId, action: "approval_failed", entityType: "approval" });
}

/** Logs an approval that used the shared manager PIN, which can't say who approved. */
export async function logSharedPinApproval(service: SupabaseClient, tenantId: string) {
  await recordAudit(service, { tenantId, action: "approval_shared_pin", entityType: "approval" });
}
