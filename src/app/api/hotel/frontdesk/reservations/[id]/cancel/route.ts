import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationsApi, todayDay } from "@/lib/hms/reservations-api";
import { cancelReservation } from "@/lib/hms/reservation-cancellation";
import { sendReservationEmail } from "@/lib/hms/reservation-emails";
import { notifyReservationCancelled } from "@/lib/hms/notification-rules";

/**
 * Kept for older callers: cancels a booking under its cancellation policy (the fee is recorded,
 * held deposits are left as they are). The reservations screens use /api/hotel/reservations/:id/cancel,
 * which lets staff see the fee first and settle deposits.
 */

const PostSchema = z.object({
  slug: z.string().min(1),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireReservationsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: before } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("confirmation_code,reservation_guests(is_primary,guests(first_name,last_name))")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    const result = await cancelReservation(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: id,
      userId: auth.user.id,
      today: todayDay(),
      reason: body.reason?.trim() || "Cancelled by staff",
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    type G = { first_name: string; last_name: string };
    const links = (before?.reservation_guests ?? []) as { is_primary: boolean; guests: G | G[] | null }[];
    const primary = links.find((l) => l.is_primary) ?? links[0];
    const guest = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
    await notifyReservationCancelled({
      tenantId: auth.tenant.id,
      guestName: guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest",
      confirmationCode: (before?.confirmation_code as string) ?? "",
      entityId: id,
    }).catch(() => undefined);
    await sendReservationEmail(auth.service, { tenantId: auth.tenant.id, reservationId: id, kind: "cancellation", userId: auth.user.id });

    return NextResponse.json({ ok: true, fee: result.fee, feeStatus: result.feeStatus });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Cancellation failed." }, { status: 500 });
  }
}
