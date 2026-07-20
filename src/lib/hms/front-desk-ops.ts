import { createServerSupabaseClient } from "@/lib/supabase/server";
import { departmentScopeForRole } from "@/lib/hms/guest-services-rbac";

export type NotificationSeverity = "info" | "warning" | "critical";

/** Postgrest `.or()` filter restricting notifications to what a department-scoped viewer
 * (Housekeeping/Maintenance/F&B) should see — their own department's targeted notifications,
 * plus untargeted/tenant-wide ones. Null when the viewer isn't department-scoped (Front Desk,
 * Manager, Admin), who continue to see everything, unchanged from before department targeting
 * existed. */
export function notificationVisibilityFilter(departmentRole: string | null): string | null {
  const scope = departmentScopeForRole(departmentRole);
  if (!scope) return null;
  return `department.is.null,department.eq.${scope}`;
}

export type EmitNotificationInput = {
  tenantId: string;
  type: string;
  title: string;
  body: string;
  severity?: NotificationSeverity;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** Restricts visibility to staff scoped to this department (housekeeping/maintenance/
   * food_beverage, per `departmentScopeForRole`); omit/null for a tenant-wide notification
   * everyone sees, same as before this field existed. */
  department?: string | null;
};

export async function emitNotification(input: EmitNotificationInput) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.schema("hotel").from("notifications").insert({
    tenant_id: input.tenantId,
    type: input.type,
    title: input.title,
    body: input.body,
    severity: input.severity ?? "info",
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    metadata: input.metadata ?? {},
    department: input.department ?? null,
  });
  if (error) console.warn("[emitNotification]", error);
}

export type AuditLogInput = {
  tenantId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export async function writeAuditLog(input: AuditLogInput) {
  const supabase = createServerSupabaseClient();
  const { error } = await supabase.schema("hotel").from("audit_logs").insert({
    tenant_id: input.tenantId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    before_state: input.before ?? null,
    after_state: input.after ?? null,
  });
  if (error) console.warn("[writeAuditLog]", error);
}

export function formatAuditMessage(params: {
  actorName: string;
  action: string;
  entityType: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  createdAt: string;
}) {
  const time = new Date(params.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  if (params.entityType === "room_unit" && params.before?.status && params.after?.status) {
    return `${params.actorName} changed Room ${params.after.room_code ?? params.before.room_code ?? "?"} from ${params.before.status} → ${params.after.status} at ${time}`;
  }
  if (params.action.startsWith("folio_")) {
    const label = params.action.replace(/_/g, " ");
    return `${params.actorName}: ${label} at ${time}`;
  }
  if (params.action === "cash_float_opened" || params.action === "cash_float_closed") {
    return `${params.actorName}: ${params.action.replace(/_/g, " ")} at ${time}`;
  }
  return `${params.actorName}: ${params.action} at ${time}`;
}
