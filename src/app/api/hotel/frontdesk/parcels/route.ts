import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { loadInHouseRecipients, loadStayRecipient, MESSAGE_CHANNELS } from "@/lib/hms/guest-messages";
import { loadParcels, mapParcel, notifyParcelGuest, PARCEL_COLUMNS } from "@/lib/hms/guest-parcels";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const LogSchema = z.object({
  slug: z.string().min(1),
  /** The guest's booking; leave out for someone who is not a current guest. */
  reservationId: z.string().uuid().optional(),
  recipientName: z.string().trim().max(120).optional(),
  description: z.string().trim().min(1, "Say what the parcel is.").max(200),
  carrier: z.string().trim().max(80).optional(),
  trackingRef: z.string().trim().max(80).optional(),
  shelf: z.string().trim().max(40).optional(),
  /** Tell the guest straight away. */
  notify: z.enum(MESSAGE_CHANNELS).optional(),
});

const UpdateSchema = z.object({
  slug: z.string().min(1),
  id: z.string().uuid(),
  action: z.enum(["collect", "return", "notify"]),
  collectedByName: z.string().trim().max(120).optional(),
  channel: z.enum(MESSAGE_CHANNELS).optional(),
});

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const [parcels, recipients] = await Promise.all([
      loadParcels(auth.service, auth.tenant.id),
      loadInHouseRecipients(auth.service, auth.tenant.id),
    ]);
    return NextResponse.json({ parcels, recipients }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load parcels." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = LogSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const stay = body.reservationId ? await loadStayRecipient(auth.service, auth.tenant.id, body.reservationId) : null;
    if (body.reservationId && !stay) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const recipientName = stay?.name ?? body.recipientName;
    if (!recipientName) return NextResponse.json({ error: "Say who the parcel is for." }, { status: 400 });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("guest_parcels")
      .insert({
        tenant_id: auth.tenant.id,
        reservation_id: stay?.reservationId ?? null,
        recipient_name: recipientName,
        room_code: stay?.roomCode ?? null,
        description: body.description,
        carrier: body.carrier || null,
        tracking_ref: body.trackingRef || null,
        shelf: body.shelf || null,
        received_by: auth.user.id,
      })
      .select(PARCEL_COLUMNS)
      .single();
    if (error || !data) {
      console.error("[parcels POST]", error?.message);
      return NextResponse.json({ error: "Could not log the parcel." }, { status: 500 });
    }
    const parcel = mapParcel(data);

    const notice =
      body.notify && stay
        ? await notifyParcelGuest(auth.service, { tenantId: auth.tenant.id, userId: auth.user.id, parcel, channel: body.notify })
        : null;

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "parcel_received",
      entityType: "guest_parcel",
      entityId: parcel.id,
      after: { recipient: recipientName, description: body.description, carrier: body.carrier ?? null },
    });
    return NextResponse.json({ ok: true, parcel, notice });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[parcels POST]", e);
    return NextResponse.json({ error: "Failed to log the parcel." }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = UpdateSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canManageRequests) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: row } = await auth.service
      .schema("hotel")
      .from("guest_parcels")
      .select(PARCEL_COLUMNS)
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.id)
      .maybeSingle();
    if (!row) return NextResponse.json({ error: "Parcel not found." }, { status: 404 });
    const parcel = mapParcel(row);
    if (parcel.status !== "received") return NextResponse.json({ error: "This parcel has already been handed over." }, { status: 409 });

    if (body.action === "notify") {
      if (!parcel.reservationId) return NextResponse.json({ error: "This parcel isn't linked to a booking." }, { status: 400 });
      const notice = await notifyParcelGuest(auth.service, {
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        parcel,
        channel: body.channel ?? "email",
      });
      return NextResponse.json({ ok: true, notice });
    }

    if (body.action === "collect" && !body.collectedByName) {
      return NextResponse.json({ error: "Write down who collected it." }, { status: 400 });
    }
    const { error } = await auth.service
      .schema("hotel")
      .from("guest_parcels")
      .update({
        status: body.action === "collect" ? "collected" : "returned",
        collected_by_name: body.action === "collect" ? body.collectedByName : null,
        collected_at: new Date().toISOString(),
        handed_over_by: auth.user.id,
      })
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.id)
      .eq("status", "received");
    if (error) return NextResponse.json({ error: "Could not update the parcel." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.action === "collect" ? "parcel_collected" : "parcel_returned",
      entityType: "guest_parcel",
      entityId: body.id,
      after: { recipient: parcel.recipientName, collectedBy: body.collectedByName ?? null },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[parcels PATCH]", e);
    return NextResponse.json({ error: "Failed to update the parcel." }, { status: 500 });
  }
}
