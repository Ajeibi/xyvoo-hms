import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getArrivalDetail } from "@/lib/hms/arrivals-workbench";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

const PatchSchema = z.object({
  slug: z.string().min(1),
  guestRemarks: z.string().max(2000).optional(),
  roomPreferencesText: z.string().max(2000).optional(),
  vipNotes: z.string().max(2000).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const currency = normalizePricingSetup(auth.tenant.pricing_setup).currency;
    const detail = await getArrivalDetail({
      tenantId: auth.tenant.id,
      reservationId: id,
      currency,
    });

    if (!detail) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    console.error("[arrivals detail GET]", e);
    return NextResponse.json({ error: "Failed to load detail." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const updates: Record<string, string | null> = {};
    if (body.guestRemarks !== undefined) updates.guest_remarks = body.guestRemarks || null;
    if (body.roomPreferencesText !== undefined) {
      updates.room_preferences_text = body.roomPreferencesText || null;
    }
    if (body.vipNotes !== undefined) updates.vip_notes = body.vipNotes || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update." }, { status: 400 });
    }

    const { data: before } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("guest_remarks,room_preferences_text,vip_notes")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    const { error } = await auth.service
      .schema("hotel")
      .from("reservations")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "reservation_notes_updated",
      entityType: "reservation",
      entityId: id,
      before: before as Record<string, unknown> | null,
      after: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
