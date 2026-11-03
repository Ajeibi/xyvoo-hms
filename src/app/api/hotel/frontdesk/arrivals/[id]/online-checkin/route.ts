import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { loadOnlineCheckIn, requestOnlineCheckIn } from "@/lib/hms/online-checkin";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const SendSchema = z.object({
  slug: z.string().min(1),
  channel: z.enum(["email", "whatsapp"]),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const checkIn = await loadOnlineCheckIn(auth.service, auth.tenant.id, id);
    return NextResponse.json({ checkIn }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load." }, { status: 500 });
  }
}

/** Sends this guest their online check-in link. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = SendSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const r = await requestOnlineCheckIn(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: id,
      channel: body.channel,
      origin: new URL(req.url).origin,
    });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "online_checkin_sent",
      entityType: "reservation",
      entityId: id,
      after: { channel: body.channel },
    });
    return NextResponse.json({ ok: true, channel: r.channel, link: r.link });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[online-checkin send one]", e);
    return NextResponse.json({ error: "Failed to send." }, { status: 500 });
  }
}
