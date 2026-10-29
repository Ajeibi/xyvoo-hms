import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import {
  DEPOSIT_METHODS,
  DEPOSIT_RESERVATION_COLUMNS,
  getDepositState,
  recordDeposit,
  type DepositReservation,
} from "@/lib/hms/folio-deposits";

/**
 * GET /api/hotel/reservations/deposits?slug=&reservationId= — what a booking's deposit is, by
 * when, and what has been paid.
 * POST — take a deposit for a booking that hasn't checked in yet.
 */

async function loadBooking(auth: Exclude<Awaited<ReturnType<typeof requireHotelApiSection>>, { error: string }>, reservationId: string) {
  const { data } = await auth.service
    .schema("hotel")
    .from("reservations")
    .select(`${DEPOSIT_RESERVATION_COLUMNS},status,confirmation_code`)
    .eq("tenant_id", auth.tenant.id)
    .eq("id", reservationId)
    .maybeSingle();
  return data as (DepositReservation & { status: string; confirmation_code: string }) | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reservationId = url.searchParams.get("reservationId") ?? "";
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!/^[0-9a-f-]{36}$/i.test(reservationId)) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const booking = await loadBooking(auth, reservationId);
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  return NextResponse.json({ status: booking.status, deposit: await getDepositState(auth.service, auth.tenant.id, booking) });
}

const PostSchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive("Enter an amount above zero."),
  method: z.enum(DEPOSIT_METHODS),
  reference: z.string().max(120).optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const booking = await loadBooking(auth, body.reservationId);
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (booking.status !== "confirmed") {
      return NextResponse.json(
        { error: booking.status === "checked_in" ? "The guest has checked in, so take this as a payment on their bill instead." : "This booking can't take a deposit." },
        { status: 400 },
      );
    }

    const result = await recordDeposit(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: booking.id,
      confirmationCode: booking.confirmation_code,
      amount: body.amount,
      method: body.method,
      reference: body.reference,
      userId: auth.user.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "deposit_taken",
      entityType: "reservation",
      entityId: booking.id,
      after: { amount: body.amount, method: body.method, reference: body.reference ?? null },
    });
    return NextResponse.json({ ok: true, deposit: await getDepositState(auth.service, auth.tenant.id, booking) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
