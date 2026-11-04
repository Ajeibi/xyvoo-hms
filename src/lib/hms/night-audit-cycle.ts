import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNightAuditBreakdown, runNightAudit, type NightAuditBreakdown } from "@/lib/hms/night-audit";
import { getBusinessDate } from "@/lib/hms/business-date";
import { runAuditChecks, type AuditCheck } from "@/lib/hms/night-audit-checks";
import { getNightAuditSettings } from "@/lib/hms/night-audit-settings";
import { processNoShows, type NoShowOutcome } from "@/lib/hms/night-audit-no-shows";
import { buildAuditReport, emailAuditReport, type AuditReport } from "@/lib/hms/night-audit-report";
import { postExtraNightsForTenant } from "@/lib/hms/folio-extra-nights";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

/*
 * Closing the business day, start to finish: the checks, charging overdue nights, handling
 * no-shows, the ledger posting, the end-of-day report and its email. Staff run it from the night
 * audit screen; the cron runs it for hotels that switched on the automatic run.
 */

export type CloseDayResult =
  | { ok: true; runId: string; journalEntryId: string | null; breakdown: NightAuditBreakdown; report: AuditReport; noShows: NoShowOutcome[]; emailed: number }
  | { ok: false; error: string; blockers?: AuditCheck[]; needsReason?: boolean; warnings?: number };

export async function closeBusinessDay(
  service: SupabaseClient,
  params: {
    tenantId: string;
    /** Person closing the day. For an automatic run, an owner of the hotel. */
    userId: string;
    auditDate: string;
    automatic: boolean;
    /** Why the manager is closing the day with warnings open. */
    overrideReason?: string | null;
    now?: Date;
  },
): Promise<CloseDayResult> {
  const now = params.now ?? new Date();
  const reason = params.overrideReason?.trim() || null;

  const checked = await runAuditChecks(service, params.tenantId, params.auditDate, now);
  const blockers = checked.checks.filter((c) => c.severity === "blocker");
  if (blockers.length > 0) return { ok: false, error: blockers[0].detail, blockers };
  if (checked.warnings > 0 && !params.automatic && !reason) {
    return { ok: false, error: "There are things left open. Say why you are closing the day anyway.", needsReason: true, warnings: checked.warnings };
  }

  const [settings, tenantRow, info] = await Promise.all([
    getNightAuditSettings(service, params.tenantId),
    service.from("tenants").select("pricing_setup").eq("id", params.tenantId).maybeSingle(),
    getBusinessDate(service, params.tenantId, now),
  ]);
  const pricingSetup = tenantRow.data?.pricing_setup;

  // Overdue stays owe their nights before the day is closed.
  await postExtraNightsForTenant(service, { tenantId: params.tenantId, pricingSetup, postedBy: params.automatic ? null : params.userId, now });

  const noShows = settings.processNoShows
    ? await processNoShows(service, {
        tenantId: params.tenantId,
        auditDate: params.auditDate,
        mode: settings.noShowMode,
        userId: params.userId,
        currency: normalizePricingSetup(pricingSetup).currency,
        timeZone: info.timeZone,
        automatic: params.automatic,
      })
    : [];

  const ran = await runNightAudit(service, { tenantId: params.tenantId, auditDate: params.auditDate, createdBy: params.userId, automatic: params.automatic, overrideReason: reason });
  if (!ran.ok) return { ok: false, error: ran.error };

  // The arrivals check is settled by the no-show step when that is switched on.
  const left = checked.checks.filter((c) => !(settings.processNoShows && c.key === "no_shows"));
  const report = await buildAuditReport(service, {
    tenantId: params.tenantId,
    auditDate: params.auditDate,
    breakdown: ran.breakdown,
    checks: left,
    noShows: noShows.map((n) => ({ confirmationCode: n.confirmationCode, keptDeposit: n.keptDeposit, fee: n.fee })),
    overrideReason: reason,
    automatic: params.automatic,
  });

  let emailed = 0;
  if (settings.emailReport) {
    emailed = await emailAuditReport(service, { tenantId: params.tenantId, report, extraRecipients: settings.extraRecipients });
  }
  await service
    .schema("hotel")
    .from("night_audit_runs")
    .update({
      report,
      exceptions: left.filter((c) => c.severity === "warning" || c.severity === "blocker").map((c) => ({ key: c.key, title: c.title, count: c.count, severity: c.severity })),
      no_shows_processed: noShows.length,
      emailed_at: emailed > 0 ? new Date().toISOString() : null,
    })
    .eq("id", ran.id);

  return { ok: true, runId: ran.id, journalEntryId: ran.journalEntryId, breakdown: ran.breakdown, report, noShows, emailed };
}

/** The figures for a day without closing it. */
export async function previewBusinessDay(service: SupabaseClient, tenantId: string, auditDate: string, now: Date = new Date()) {
  const [breakdown, checks, settings] = await Promise.all([
    computeNightAuditBreakdown(service, tenantId, auditDate),
    runAuditChecks(service, tenantId, auditDate, now),
    getNightAuditSettings(service, tenantId),
  ]);
  return { breakdown, checks, settings };
}
