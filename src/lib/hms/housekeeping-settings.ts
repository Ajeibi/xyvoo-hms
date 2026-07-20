import type { SupabaseClient } from "@supabase/supabase-js";

export const INSPECTION_POLICIES = ["all", "spot_check", "self"] as const;
export type InspectionPolicy = (typeof INSPECTION_POLICIES)[number];

export type TenantHousekeepingSettings = {
  slaCheckoutMinutes: number;
  slaStayoverMinutes: number;
  slaDeepCleanMinutes: number;
  slaTurndownMinutes: number;
  inspectionPolicy: InspectionPolicy;
  spotCheckPercent: number;
  selfInspectionAllowed: boolean;
  priorityEscalationMinutes: number;
  stayoverCadenceDays: number;
};

const DEFAULTS: TenantHousekeepingSettings = {
  slaCheckoutMinutes: 30,
  slaStayoverMinutes: 20,
  slaDeepCleanMinutes: 90,
  slaTurndownMinutes: 20,
  inspectionPolicy: "all",
  spotCheckPercent: 20,
  selfInspectionAllowed: false,
  priorityEscalationMinutes: 15,
  stayoverCadenceDays: 1,
};

export function slaMinutesForTaskType(taskType: string, settings: TenantHousekeepingSettings): number {
  switch (taskType) {
    case "stayover":
      return settings.slaStayoverMinutes;
    case "deep_clean":
      return settings.slaDeepCleanMinutes;
    case "turndown":
      return settings.slaTurndownMinutes;
    case "checkout_clean":
    case "reinspection":
    default:
      return settings.slaCheckoutMinutes;
  }
}

/** Falls back to an SLA-derived deadline when a task has no explicit `due_by` (only
 * priority-clean-flagged tasks get one today) — every task gets a countdown, not just VIP ones. */
export function effectiveTaskDueBy(
  createdAt: string,
  taskType: string,
  dueBy: string | null,
  settings: TenantHousekeepingSettings,
): string {
  if (dueBy) return dueBy;
  const slaMinutes = slaMinutesForTaskType(taskType, settings);
  return new Date(new Date(createdAt).getTime() + slaMinutes * 60_000).toISOString();
}

export async function getTenantHousekeepingSettings(
  service: SupabaseClient,
  tenantId: string,
): Promise<TenantHousekeepingSettings> {
  const { data } = await service
    .schema("hotel")
    .from("tenant_housekeeping_settings")
    .select(
      "sla_checkout_minutes,sla_stayover_minutes,sla_deep_clean_minutes,sla_turndown_minutes,inspection_policy,spot_check_percent,self_inspection_allowed,priority_escalation_minutes,stayover_cadence_days",
    )
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return DEFAULTS;

  return {
    slaCheckoutMinutes: data.sla_checkout_minutes ?? DEFAULTS.slaCheckoutMinutes,
    slaStayoverMinutes: data.sla_stayover_minutes ?? DEFAULTS.slaStayoverMinutes,
    slaDeepCleanMinutes: data.sla_deep_clean_minutes ?? DEFAULTS.slaDeepCleanMinutes,
    slaTurndownMinutes: data.sla_turndown_minutes ?? DEFAULTS.slaTurndownMinutes,
    inspectionPolicy: (data.inspection_policy as InspectionPolicy) ?? DEFAULTS.inspectionPolicy,
    spotCheckPercent: data.spot_check_percent ?? DEFAULTS.spotCheckPercent,
    selfInspectionAllowed: data.self_inspection_allowed ?? DEFAULTS.selfInspectionAllowed,
    priorityEscalationMinutes: data.priority_escalation_minutes ?? DEFAULTS.priorityEscalationMinutes,
    stayoverCadenceDays: data.stayover_cadence_days ?? DEFAULTS.stayoverCadenceDays,
  };
}

export async function upsertTenantHousekeepingSettings(
  service: SupabaseClient,
  tenantId: string,
  input: TenantHousekeepingSettings,
): Promise<TenantHousekeepingSettings> {
  const { error } = await service
    .schema("hotel")
    .from("tenant_housekeeping_settings")
    .upsert(
      {
        tenant_id: tenantId,
        sla_checkout_minutes: input.slaCheckoutMinutes,
        sla_stayover_minutes: input.slaStayoverMinutes,
        sla_deep_clean_minutes: input.slaDeepCleanMinutes,
        sla_turndown_minutes: input.slaTurndownMinutes,
        inspection_policy: input.inspectionPolicy,
        spot_check_percent: input.spotCheckPercent,
        self_inspection_allowed: input.selfInspectionAllowed,
        priority_escalation_minutes: input.priorityEscalationMinutes,
        stayover_cadence_days: input.stayoverCadenceDays,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
  if (error) throw error;
  return input;
}
