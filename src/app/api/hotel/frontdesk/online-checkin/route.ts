import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import {
  ID_POLICIES,
  loadCheckInSettings,
  loadUpcomingArrivals,
  requestOnlineCheckIn,
  saveCheckInSettings,
} from "@/lib/hms/online-checkin";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const SendSchema = z.object({
  slug: z.string().min(1),
  reservationIds: z.array(z.string().uuid()).min(1, "Choose who to send it to.").max(100),
  channel: z.enum(["email", "whatsapp"]),
});

const SettingsSchema = z.object({
  slug: z.string().min(1),
  idPolicy: z.enum(ID_POLICIES),
  daysBefore: z.coerce.number().int().min(1).max(14),
});

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const settings = await loadCheckInSettings(auth.service, auth.tenant.id);
    const arrivals = await loadUpcomingArrivals(auth.service, auth.tenant.id, settings.daysBefore);
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    return NextResponse.json({ settings, arrivals, canManage: caps.canBulkActions }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}

/** Sends the check-in link to each chosen booking. Email goes out now; WhatsApp returns a chat link per guest. */
export async function POST(req: Request) {
  try {
    const body = SendSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const origin = new URL(req.url).origin;
    const results = [];
    for (const reservationId of body.reservationIds) {
      const r = await requestOnlineCheckIn(auth.service, { tenantId: auth.tenant.id, reservationId, channel: body.channel, origin });
      results.push({ reservationId, ...(r.ok ? { ok: true as const, link: r.link } : { ok: false as const, error: r.error }) });
    }
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "online_checkin_sent",
      entityType: "reservation",
      entityId: body.reservationIds.length === 1 ? body.reservationIds[0] : null,
      after: { channel: body.channel, sent: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length },
    });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[online-checkin send]", e);
    return NextResponse.json({ error: "Failed to send." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = SettingsSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canBulkActions) return NextResponse.json({ error: "Only a manager can change these." }, { status: 403 });
    const before = await loadCheckInSettings(auth.service, auth.tenant.id);
    const saved = await saveCheckInSettings(auth.service, auth.tenant.id, { idPolicy: body.idPolicy, daysBefore: body.daysBefore });
    if (!saved.ok) return NextResponse.json({ error: "Could not save. The online check-in update may not have been run yet." }, { status: 500 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "online_checkin_settings_changed",
      entityType: "tenant",
      entityId: auth.tenant.id,
      before,
      after: { idPolicy: body.idPolicy, daysBefore: body.daysBefore },
    });
    return NextResponse.json({ ok: true, settings: { idPolicy: body.idPolicy, daysBefore: body.daysBefore } });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[online-checkin settings]", e);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
