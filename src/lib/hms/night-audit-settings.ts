import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { DEFAULT_NIGHT_AUDIT_SETTINGS, EMAIL_RE, parseRecipients, type NightAuditSettings, type NoShowMode } from "@/lib/hms/night-audit-settings-shared";

export * from "@/lib/hms/night-audit-settings-shared";

export async function getNightAuditSettings(service: SupabaseClient, tenantId: string): Promise<NightAuditSettings> {
  const { data } = await service.schema("hotel").from("night_audit_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (!data) return DEFAULT_NIGHT_AUDIT_SETTINGS;
  return {
    startDate: (data.start_date as string | null) ?? null,
    autoRun: Boolean(data.auto_run),
    autoRunHour: Number(data.auto_run_hour) || 0,
    processNoShows: data.process_no_shows !== false,
    noShowMode: (data.no_show_mode as NoShowMode) ?? "policy",
    emailReport: data.email_report !== false,
    extraRecipients: (data.extra_recipients as string | null) ?? "",
  };
}

export async function saveNightAuditSettings(
  service: SupabaseClient,
  params: { tenantId: string; userId: string; settings: NightAuditSettings; today: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = params.settings;
  if (!Number.isInteger(s.autoRunHour) || s.autoRunHour < 0 || s.autoRunHour > 23) return { ok: false, error: "Choose an hour from 0 to 23." };
  if (s.startDate && s.startDate > params.today) return { ok: false, error: "The business date can't start in the future." };
  const bad = s.extraRecipients.split(/[,;\s]+/).filter((e) => e.trim() && !EMAIL_RE.test(e.trim()));
  if (bad.length > 0) return { ok: false, error: `${bad[0]} is not an email address.` };

  const before = await getNightAuditSettings(service, params.tenantId);
  const { error } = await service.schema("hotel").from("night_audit_settings").upsert(
    {
      tenant_id: params.tenantId,
      start_date: s.startDate || null,
      auto_run: s.autoRun,
      auto_run_hour: s.autoRunHour,
      process_no_shows: s.processNoShows,
      no_show_mode: s.noShowMode,
      email_report: s.emailReport,
      extra_recipients: parseRecipients(s.extraRecipients).join(", ") || null,
      updated_by: params.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { ok: false, error: error.message };
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.userId,
    action: "night_audit_settings_changed",
    entityType: "night_audit_settings",
    entityId: params.tenantId,
    before,
    after: s,
  });
  return { ok: true };
}
