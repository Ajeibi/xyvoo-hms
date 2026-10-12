import { createServerSupabaseClient } from "@/lib/supabase/server";
import { compactValue, type ActivityArea, type ActivityChanges } from "./activity-text";

export { diffFields, type ActivityArea, type ActivityChanges } from "./activity-text";

/*
 * The activity log: who changed what in the dashboard. Call logActivity()
 * after a change has been saved. It never throws and never blocks the change:
 * if the log can't be written, the failure is logged on the server only.
 *
 *   await logActivity({
 *     tenantId: access.tenantId,
 *     actor: access,                    // anything with userId and currentUserName
 *     area: "products",
 *     action: "updated",
 *     targetId: product.id,
 *     targetLabel: product.name,
 *     changes: diffFields(before, updates),
 *   });
 *
 * Never put secrets (keys, full account numbers, tokens) in `changes`.
 */

export type ActivityActor = { userId: string | null; currentUserName?: string | null; name?: string | null };

export type LogActivityInput = {
  tenantId: string;
  actor: ActivityActor;
  area: ActivityArea;
  /** Lower case with underscores: created, updated, deleted, invited, role_changed, removed ... */
  action: string;
  targetId?: string | null;
  targetLabel?: string | null;
  changes?: ActivityChanges;
};

/** Fields never written to the log, whatever a caller passes. */
const SECRET_FIELD = /(secret|password|token|key|account_number$|code_hash|token_hash)/i;

function cleanChanges(changes: ActivityChanges | undefined): ActivityChanges {
  const out: ActivityChanges = {};
  for (const [field, change] of Object.entries(changes ?? {})) {
    if (SECRET_FIELD.test(field) && field !== "account_number_last4") continue;
    out[field] = { from: compactValue(change?.from), to: compactValue(change?.to) };
  }
  return out;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const changes = cleanChanges(input.changes);
    // An edit that changed nothing isn't worth a line in the log.
    if (input.action === "updated" && input.changes && Object.keys(changes).length === 0) return;
    const name = (input.actor.name ?? input.actor.currentUserName ?? "").trim().slice(0, 120);
    const { error } = await createServerSupabaseClient()
      .schema("store")
      .from("activity_log")
      .insert({
        tenant_id: input.tenantId,
        actor_user_id: input.actor.userId,
        actor_name: name,
        area: input.area,
        action: input.action.toLowerCase().replace(/[^a-z_]/g, "_").slice(0, 40),
        target_id: input.targetId ? String(input.targetId).slice(0, 100) : null,
        target_label: input.targetLabel ? String(input.targetLabel).slice(0, 200) : null,
        changes,
      });
    if (error) console.error("[activity] not logged", { area: input.area, action: input.action, error: error.message });
  } catch (error) {
    console.error("[activity] not logged", { area: input.area, action: input.action, error });
  }
}

/**
 * The current values of the given fields, read before an update so the log
 * can say what they were. Returns null if the row can't be read; logging then
 * records only the new values.
 */
export async function readBefore(
  table: string,
  tenantId: string,
  id: string,
  fields: readonly string[],
): Promise<Record<string, unknown> | null> {
  if (!fields.length) return null;
  try {
    const { data } = await createServerSupabaseClient()
      .schema("store")
      .from(table)
      .select(fields.join(","))
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    return (data as Record<string, unknown> | null) ?? null;
  } catch {
    return null;
  }
}
