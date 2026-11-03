import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { loadFeedback, requestStayFeedback, summariseFeedback } from "@/lib/hms/stay-feedback";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations", "guests"];

const ResendSchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  channel: z.enum(["email", "whatsapp"]),
});

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const slug = sp.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const guestId = sp.get("guestId") ?? undefined;
    const rows = await loadFeedback(auth.service, auth.tenant.id, { guestId, limit: guestId ? 50 : 200 });
    return NextResponse.json({ feedback: rows, summary: summariseFeedback(rows) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load feedback." }, { status: 500 });
  }
}

/** Sends (or sends again) the feedback link for a stay. */
export async function POST(req: Request) {
  try {
    const body = ResendSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await requestStayFeedback(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      channel: body.channel,
      origin: new URL(req.url).origin,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "feedback_requested",
      entityType: "reservation",
      entityId: body.reservationId,
      after: { channel: body.channel },
    });
    return NextResponse.json({ ok: true, channel: result.channel, link: result.link });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[feedback resend]", e);
    return NextResponse.json({ error: "Failed to send." }, { status: 500 });
  }
}
