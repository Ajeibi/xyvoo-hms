import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listNightAuditRuns } from "@/lib/hms/night-audit";
import { closeBusinessDay, previewBusinessDay } from "@/lib/hms/night-audit-cycle";
import { getBusinessDate } from "@/lib/hms/business-date";
import { emailAuditReport, type AuditReport } from "@/lib/hms/night-audit-report";
import { getNightAuditSettings } from "@/lib/hms/night-audit-settings";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PostBody = z.object({
  slug: z.string().min(1),
  date: z.string().regex(DATE_RE),
  overrideReason: z.string().trim().max(500).optional(),
});
const EmailBody = z.object({ slug: z.string().min(1), runId: z.string().uuid() });

/**
 * GET ?slug            the business date and the run history.
 * GET ?slug&date       the figures and the checks for a day, without closing it.
 * GET ?slug&run=<id>   the end-of-day report kept on a run.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const date = url.searchParams.get("date");
    const runId = url.searchParams.get("run");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    if (runId) {
      const { data } = await auth.service.schema("hotel").from("night_audit_runs").select("report").eq("tenant_id", auth.tenant.id).eq("id", runId).maybeSingle();
      return NextResponse.json({ report: (data?.report as AuditReport | null) ?? null });
    }

    if (date) {
      if (!DATE_RE.test(date)) return NextResponse.json({ error: "Pick a date." }, { status: 400 });
      const preview = await previewBusinessDay(auth.service, auth.tenant.id, date);
      return NextResponse.json(preview);
    }

    const [runs, business, settings] = await Promise.all([
      listNightAuditRuns(auth.service, auth.tenant.id),
      getBusinessDate(auth.service, auth.tenant.id),
      getNightAuditSettings(auth.service, auth.tenant.id),
    ]);
    return NextResponse.json({ runs, business, settings });
  } catch (e) {
    console.error("[night-audit GET]", e);
    return NextResponse.json({ error: "Failed to load night audit data." }, { status: 500 });
  }
}

/** Closes a business day. */
export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canRunNightAudit) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await closeBusinessDay(auth.service, {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      auditDate: body.date,
      automatic: false,
      overrideReason: body.overrideReason,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error, needsReason: result.needsReason ?? false, blockers: result.blockers ?? [] }, { status: result.needsReason ? 409 : 400 });
    }
    return NextResponse.json({
      ok: true,
      id: result.runId,
      journalEntryId: result.journalEntryId,
      breakdown: result.breakdown,
      noShows: result.noShows.length,
      emailed: result.emailed,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[night-audit POST]", e);
    return NextResponse.json({ error: "Failed to run night audit." }, { status: 500 });
  }
}

/** Sends a closed day's report again. */
export async function PATCH(req: Request) {
  try {
    const body = EmailBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canRunNightAudit) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: run } = await auth.service.schema("hotel").from("night_audit_runs").select("id,report").eq("tenant_id", auth.tenant.id).eq("id", body.runId).maybeSingle();
    if (!run?.report) return NextResponse.json({ error: "This day has no report to send." }, { status: 404 });

    const settings = await getNightAuditSettings(auth.service, auth.tenant.id);
    const sent = await emailAuditReport(auth.service, { tenantId: auth.tenant.id, report: run.report as AuditReport, extraRecipients: settings.extraRecipients });
    if (sent === 0) return NextResponse.json({ error: "The report couldn't be emailed. Check the email addresses and try again." }, { status: 502 });
    await auth.service.schema("hotel").from("night_audit_runs").update({ emailed_at: new Date().toISOString() }).eq("id", run.id);
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[night-audit PATCH]", e);
    return NextResponse.json({ error: "Failed to send the report." }, { status: 500 });
  }
}
