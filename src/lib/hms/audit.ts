import type { SupabaseClient } from "@supabase/supabase-js";
import { attributionOf, takePendingApprover } from "@/lib/hms/attribution";

/*
 * The activity log. One writer for every module: voids, discounts, refunds, rate changes, approvals,
 * staff changes, failed sign-ins and PIN attempts all land in hotel.audit_logs, each with who did it
 * (id and name at the time), their department, and who approved it when someone did.
 *
 * Pass the signed-in member's client (from requireHotelApiMember) and the actor and any approver are
 * filled in for you. Never throws: the log must not stop the action it records.
 */

export type AuditEntry = {
  tenantId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  /** Leave out to use the person behind `service`; pass for events with no signed-in member (failed sign-ins). */
  actor?: { userId: string | null; name?: string | null; department?: string | null } | null;
  approver?: { userId: string; name: string } | null;
  device?: string | null;
};

const MISSING_COLUMN = /(column|schema cache)/i;

/** Name and department of a person at a hotel, for log lines written without a signed-in session behind them. */
export async function lookupActorSnapshot(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<{ name: string | null; department: string | null }> {
  const [{ data: membership }, { data: user }] = await Promise.all([
    service.schema("hotel").from("memberships").select("department_role, username").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle(),
    service.auth.admin.getUserById(userId),
  ]);
  const meta = (user?.user?.user_metadata ?? {}) as Record<string, unknown>;
  const full = typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : null;
  const username = (membership as { username?: string | null } | null)?.username ?? null;
  const dept = (membership as { department_role?: string | null } | null)?.department_role ?? null;
  return { name: full ?? username ?? user?.user?.email?.split("@")[0] ?? null, department: dept?.trim() || null };
}

export async function recordAudit(service: SupabaseClient, entry: AuditEntry): Promise<void> {
  try {
    const state = attributionOf(service);
    let actorUserId = entry.actor !== undefined ? (entry.actor?.userId ?? null) : (state?.actor.userId ?? null);
    let actorName = entry.actor?.name ?? (entry.actor === undefined ? (state?.actor.name ?? null) : null);
    let department = entry.actor?.department ?? (entry.actor === undefined ? (state?.actor.department ?? null) : null);

    // A caller that only knows the user id (older code) still gets a name and department.
    if (actorUserId && (!actorName || !department)) {
      const snapshot = await lookupActorSnapshot(service, entry.tenantId, actorUserId).catch(() => null);
      actorName = actorName ?? snapshot?.name ?? null;
      department = department ?? snapshot?.department ?? null;
    }
    actorUserId = actorUserId ?? null;

    // The approval's own line names its approver itself; the action it unlocked picks the approver up here.
    const pendingApprover = entry.entityType === "approval" ? null : takePendingApprover(entry.tenantId, actorUserId);
    const approver = entry.approver ?? pendingApprover ?? (entry.entityType === "approval" ? null : (state?.approver ?? null));
    const base = {
      tenant_id: entry.tenantId,
      actor_user_id: actorUserId,
      action: entry.action,
      entity_type: entry.entityType,
      entity_id: entry.entityId ?? null,
      before_state: entry.before ?? null,
      after_state: entry.after ?? null,
    };
    const full = {
      ...base,
      actor_name: actorName,
      approver_user_id: approver?.userId ?? null,
      approver_name: approver?.name ?? null,
      department,
      device: entry.device ?? null,
    };
    const log = service.schema("hotel").from("audit_logs");
    const { error } = await log.insert(full);
    if (!error) return;
    // Before migration 20261215110000 the extra columns don't exist: keep the original line, fold the rest into it.
    if (MISSING_COLUMN.test(error.message)) {
      const { error: legacy } = await log.insert({
        ...base,
        after_state: { ...(entry.after ?? {}), _actor_name: actorName, _approver_name: approver?.name ?? undefined },
      });
      if (!legacy) return;
      console.warn("[recordAudit]", legacy.message);
      return;
    }
    console.warn("[recordAudit]", error.message);
  } catch (error) {
    console.warn("[recordAudit]", error);
  }
}
