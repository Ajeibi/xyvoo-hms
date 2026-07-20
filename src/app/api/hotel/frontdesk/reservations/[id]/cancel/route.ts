import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyReservationCancelled } from "@/lib/hms/notification-rules";

const PostSchema = z.object({
  slug: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: reservation, error } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select(
        "id,confirmation_code,status,room_unit_id,reservation_guests(is_primary,guests(first_name,last_name))",
      )
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (error || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (reservation.status !== "confirmed") {
      return NextResponse.json(
        { error: "Only confirmed reservations can be cancelled." },
        { status: 400 },
      );
    }

    const updates = { status: "cancelled" as const, room_unit_id: null };

    const { error: updateError } = await auth.service
      .schema("hotel")
      .from("reservations")
      .update(updates)
      .eq("id", id)
      .eq("tenant_id", auth.tenant.id);

    if (updateError) {
      return NextResponse.json({ error: "Could not cancel reservation." }, { status: 500 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "reservation_cancelled",
      entityType: "reservation",
      entityId: id,
      before: { status: reservation.status, room_unit_id: reservation.room_unit_id },
      after: { ...updates, reason: body.reason?.trim() || null },
    });

    const links = reservation.reservation_guests as
      | { is_primary: boolean; guests: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[]
      | null;
    const primary = links?.find((l) => l.is_primary) ?? links?.[0];
    const guest = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
    const guestName = guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest";

    await notifyReservationCancelled({
      tenantId: auth.tenant.id,
      guestName,
      confirmationCode: reservation.confirmation_code,
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Cancellation failed." }, { status: 500 });
  }
}
