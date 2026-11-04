import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SavedAlert } from "@/lib/hms/alert-delivery";
import { alertGroupForType } from "@/lib/hms/notification-catalogue";

/**
 * The one way any HMS module raises an alert. Call `sendAlert` (or one of the helpers in
 * notification-rules.ts, which call it); never write to hotel.notifications directly.
 * It never throws: an alert must not get in the way of the check-in, payment or order that
 * raised it.
 */

export type AlertSeverity = "info" | "warning" | "critical";

export type AlertInput = {
  tenantId: string;
  type: string;
  title: string;
  body: string;
  severity?: AlertSeverity;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  /** Restricts visibility to staff scoped to this department (housekeeping/maintenance/
   * food_beverage, per `departmentScopeForRole`); omit/null for a tenant-wide alert. */
  department?: string | null;
  /** Skip this alert if one of the same type for the same entity was raised in the last
   * this-many hours. Needs `entityId`. */
  dedupeHours?: number;
};

/*
 * Email, push and WhatsApp delivery (alert-delivery.ts) pulls in server-only mail and push
 * libraries. This file is reachable from browser bundles through front-desk-ops.ts, so it can't
 * import them. Instead the server registers the delivery function once at start-up
 * (src/instrumentation.ts -> alert-delivery-register.ts) and sendAlert calls it if present.
 */
type DeliverFn = (service: SupabaseClient, alert: SavedAlert) => Promise<void>;
const DELIVERY_KEY = "__xyvooHmsAlertDelivery";

export function registerAlertDelivery(fn: DeliverFn) {
  (globalThis as Record<string, unknown>)[DELIVERY_KEY] = fn;
}

export type AlertResult ={ id: string | null; skipped?: "duplicate" | "failed" };

/** The category column comes with a migration; until it has run, alerts are saved without it. */
const missingColumn = (error: { code?: string; message?: string } | null) =>
  Boolean(error && (error.code === "42703" || error.code === "PGRST204"));

export async function sendAlert(input: AlertInput): Promise<AlertResult> {
  try {
    const supabase = createServerSupabaseClient();

    if (input.dedupeHours && input.entityId) {
      const since = new Date(Date.now() - input.dedupeHours * 3600000).toISOString();
      const { data: recent } = await supabase
        .schema("hotel")
        .from("notifications")
        .select("id")
        .eq("tenant_id", input.tenantId)
        .eq("type", input.type)
        .eq("entity_id", input.entityId)
        .gte("created_at", since)
        .limit(1);
      if (recent?.length) return { id: null, skipped: "duplicate" };
    }

    const row = {
      tenant_id: input.tenantId,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? "info",
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      metadata: input.metadata ?? {},
      department: input.department ?? null,
    };
    const table = () => supabase.schema("hotel").from("notifications");
    let { data, error } = await table().insert({ ...row, category: alertGroupForType(input.type) }).select("id").single();
    if (missingColumn(error)) ({ data, error } = await table().insert(row).select("id").single());
    if (error || !data) {
      console.warn("[sendAlert]", error);
      return { id: null, skipped: "failed" };
    }
    // Email, push and WhatsApp for the people who chose them. In-app alerts need nothing more.
    const deliver = (globalThis as Record<string, unknown>)[DELIVERY_KEY] as DeliverFn | undefined;
    await deliver?.(supabase, {
      id: data.id as string,
      tenantId: input.tenantId,
      type: input.type,
      title: input.title,
      body: input.body,
      severity: input.severity ?? "info",
      department: input.department ?? null,
    });
    return { id: data.id as string };
  } catch (e) {
    console.warn("[sendAlert]", e);
    return { id: null, skipped: "failed" };
  }
}
