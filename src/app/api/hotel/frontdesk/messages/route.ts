import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import {
  loadInHouseRecipients,
  loadRecentMessages,
  loadStayMessages,
  loadStayRecipient,
  MESSAGE_CHANNELS,
  sendGuestMessages,
} from "@/lib/hms/guest-messages";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const SendSchema = z.object({
  slug: z.string().min(1),
  channel: z.enum(MESSAGE_CHANNELS),
  subject: z.string().trim().max(150).default(""),
  body: z.string().trim().min(1, "Write the message first.").max(1500),
  /** One stay, or leave out to message everyone in the house. */
  reservationId: z.string().uuid().optional(),
});

export async function GET(req: Request) {
  try {
    const sp = new URL(req.url).searchParams;
    const slug = sp.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const reservationId = sp.get("reservationId");
    if (reservationId) {
      const messages = await loadStayMessages(auth.service, auth.tenant.id, reservationId);
      return NextResponse.json({ messages }, { headers: { "Cache-Control": "no-store" } });
    }
    const [recipients, recent] = await Promise.all([
      loadInHouseRecipients(auth.service, auth.tenant.id),
      loadRecentMessages(auth.service, auth.tenant.id),
    ]);
    return NextResponse.json({ recipients, recent }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load messages." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = SendSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    if (body.channel === "email" && !body.subject) {
      return NextResponse.json({ error: "Add a subject for the email." }, { status: 400 });
    }

    const broadcast = !body.reservationId;
    const recipients = body.reservationId
      ? [await loadStayRecipient(auth.service, auth.tenant.id, body.reservationId)].filter((r): r is NonNullable<typeof r> => r !== null)
      : await loadInHouseRecipients(auth.service, auth.tenant.id);
    if (recipients.length === 0) {
      return NextResponse.json({ error: broadcast ? "Nobody is in the house right now." : "Booking not found." }, { status: 404 });
    }

    const results = await sendGuestMessages(auth.service, {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      channel: body.channel,
      subject: body.subject,
      body: body.body,
      recipients,
      broadcast,
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: broadcast ? "guest_broadcast_sent" : "guest_message_sent",
      entityType: "reservation",
      entityId: body.reservationId ?? null,
      after: {
        channel: body.channel,
        guests: results.length,
        sent: results.filter((r) => r.status === "sent").length,
        prepared: results.filter((r) => r.status === "prepared").length,
        failed: results.filter((r) => r.status === "failed").length,
      },
    });
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[messages POST]", e);
    return NextResponse.json({ error: "Failed to send." }, { status: 500 });
  }
}
