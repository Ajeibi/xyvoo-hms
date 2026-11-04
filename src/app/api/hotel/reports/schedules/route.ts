import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getReportsCapabilities } from "@/lib/hms/reports-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { getReportDef } from "@/lib/hms/reports/library";
import { mapSchedule, SCHEDULE_COLUMNS } from "@/lib/hms/reports/schedule-rules";
import { sendScheduledReport } from "@/lib/hms/reports/schedules";

const Create = z.object({
  slug: z.string().min(1),
  action: z.literal("create"),
  reportKey: z.string().min(1),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  sendHour: z.number().int().min(0).max(23),
  weekday: z.number().int().min(1).max(7).nullable().optional(),
  monthDay: z.number().int().min(1).max(28).nullable().optional(),
  fileFormat: z.enum(["pdf", "xlsx"]),
  recipients: z.array(z.string().trim().toLowerCase().email("Enter valid email addresses.")).min(1, "Add at least one email address.").max(10, "At most 10 email addresses."),
});
const Toggle = z.object({ slug: z.string().min(1), action: z.literal("toggle"), id: z.string().uuid(), active: z.boolean() });
const Remove = z.object({ slug: z.string().min(1), action: z.literal("delete"), id: z.string().uuid() });
const SendNow = z.object({ slug: z.string().min(1), action: z.literal("send_now"), id: z.string().uuid() });
const Body = z.discriminatedUnion("action", [Create, Toggle, Remove, SendNow]);

async function authorise(slug: string) {
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) } as const;
  const caps = getReportsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
  if (!caps.canSchedule) return { response: NextResponse.json({ error: "Only owners, admins and Accounts can schedule reports." }, { status: 403 }) } as const;
  return { auth } as const;
}

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const a = await authorise(slug);
    if ("response" in a) return a.response;
    const { data, error } = await a.auth.service.schema("hotel").from("report_schedules").select(SCHEDULE_COLUMNS).eq("tenant_id", a.auth.tenant.id).order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return NextResponse.json({ schedules: (data ?? []).map(mapSchedule) });
  } catch (e) {
    console.error("[report schedules GET]", e);
    return NextResponse.json({ error: "Failed to load the schedules." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());
    const a = await authorise(body.slug);
    if ("response" in a) return a.response;
    const { auth } = a;
    const table = () => auth.service.schema("hotel").from("report_schedules");

    if (body.action === "create") {
      const def = getReportDef(body.reportKey);
      if (!def) return NextResponse.json({ error: "That report does not exist." }, { status: 400 });
      const { data, error } = await table()
        .insert({
          tenant_id: auth.tenant.id,
          report_key: def.key,
          frequency: body.frequency,
          send_hour: body.sendHour,
          weekday: body.frequency === "weekly" ? (body.weekday ?? 1) : null,
          month_day: body.frequency === "monthly" ? (body.monthDay ?? 1) : null,
          file_format: body.fileFormat,
          recipients: [...new Set(body.recipients)],
          created_by: auth.user.id,
        })
        .select(SCHEDULE_COLUMNS)
        .single();
      if (error) throw new Error(error.message);
      await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: "report_schedule_created", entityType: "report_schedule", entityId: data.id as string, after: { report: def.key, frequency: body.frequency, recipients: body.recipients } });
      return NextResponse.json({ ok: true, schedule: mapSchedule(data) });
    }

    const { data: row } = await table().select(SCHEDULE_COLUMNS).eq("id", body.id).eq("tenant_id", auth.tenant.id).maybeSingle();
    if (!row) return NextResponse.json({ error: "That schedule was not found." }, { status: 404 });

    if (body.action === "toggle") {
      await table().update({ active: body.active }).eq("id", body.id).eq("tenant_id", auth.tenant.id);
      await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: body.active ? "report_schedule_resumed" : "report_schedule_paused", entityType: "report_schedule", entityId: body.id });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "delete") {
      await table().delete().eq("id", body.id).eq("tenant_id", auth.tenant.id);
      await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: "report_schedule_deleted", entityType: "report_schedule", entityId: body.id, before: { report: row.report_key } });
      return NextResponse.json({ ok: true });
    }

    // send_now: the same email the schedule would send, right away, without using up today's slot.
    const { sent } = await sendScheduledReport(auth.service, mapSchedule(row), {
      id: auth.tenant.id,
      slug: body.slug,
      currency: normalizePricingSetup(auth.tenant.pricing_setup).currency,
      hotelName: auth.tenant.display_name?.trim() || auth.tenant.name?.trim() || body.slug,
    });
    return NextResponse.json({ ok: true, sent });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check the form." }, { status: 400 });
    console.error("[report schedules POST]", e);
    return NextResponse.json({ error: "That didn't work. Try again." }, { status: 500 });
  }
}
