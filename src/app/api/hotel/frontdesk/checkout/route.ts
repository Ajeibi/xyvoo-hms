import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { getFolioForReservation, getTenantFolioSettings, adjustFolioForEarlyCheckout } from "@/lib/hms/folio";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { notifyCheckoutCompleted, notifyCommissionDue, notifyOverdueCheckout } from "@/lib/hms/notification-rules";
import { openOrEscalateHousekeepingTask } from "@/lib/hms/housekeeping-tasks";
import { setRoomStatus } from "@/lib/hms/room-status";

const CheckoutSchema = z
  .object({
    slug: z.string().min(1),
    reservationId: z.string().uuid().optional(),
    roomCode: z.string().min(1).max(20).optional(),
    notes: z.string().max(500).optional(),
    overrideBalance: z.boolean().optional(),
  })
  .refine((d) => d.reservationId || d.roomCode, {
    message: "reservationId or roomCode required",
  });

export async function POST(req: Request) {
  try {
    const body = CheckoutSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let query = auth.service
      .schema("hotel")
      .from("reservations")
      .select(
        "id,confirmation_code,arrival_at,departure_at,nights,checked_in_at,rate_per_night,total_room_charges,room_unit_id,status,tenant_id,commission_plan,commission_value",
      )
      .eq("tenant_id", auth.tenant.id)
      .eq("status", "checked_in");

    if (body.reservationId) {
      query = query.eq("id", body.reservationId);
    } else if (body.roomCode) {
      const { data: unit } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("id")
        .eq("tenant_id", auth.tenant.id)
        .eq("room_code", body.roomCode.trim())
        .maybeSingle();
      if (!unit) return NextResponse.json({ error: "Room not found." }, { status: 404 });
      query = query.eq("room_unit_id", unit.id);
    }

    const { data: reservation, error: findError } = await query.maybeSingle();
    if (findError || !reservation) {
      return NextResponse.json({ error: "No active stay found to check out." }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const checkoutAt = new Date(nowIso);
    const currency = normalizePricingSetup(auth.tenant.pricing_setup).currency;

    let earlyCheckoutCredit = 0;
    let actualStayNights: number | null = null;
    if (reservation.checked_in_at) {
      const adjustment = await adjustFolioForEarlyCheckout(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: reservation.id,
        bookedNights: reservation.nights,
        checkedInAt: reservation.checked_in_at,
        checkoutAt,
        postedBy: auth.user.id,
        currencyCode: currency,
      });
      actualStayNights = adjustment.actualNights;
      if (adjustment.adjusted) {
        earlyCheckoutCredit = adjustment.creditAmount;
        await writeAuditLog({
          tenantId: auth.tenant.id,
          actorUserId: auth.user.id,
          action: "folio_early_checkout_adjustment",
          entityType: "reservation",
          entityId: reservation.id,
          after: {
            bookedNights: reservation.nights,
            actualNights: adjustment.actualNights,
            unusedNights: adjustment.unusedNights,
            creditAmount: adjustment.creditAmount,
          },
        });
      }
    }

    const folio = await getFolioForReservation(auth.service, auth.tenant.id, reservation.id);
    const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);
    if (
      folio.balance > 0.01 &&
      !settings.allowCheckoutWithBalance &&
      !body.overrideBalance &&
      !isAdminLikeRole(auth.role)
    ) {
      return NextResponse.json(
        { error: "Outstanding folio balance must be settled before checkout.", balance: folio.balance },
        { status: 409 },
      );
    }

    const wasOverdue = new Date(reservation.departure_at).getTime() < Date.now();

    const bookedTotal = Number(reservation.total_room_charges) || 0;
    const bookedNights = Math.max(1, reservation.nights);
    const adjustedRoomTotal =
      earlyCheckoutCredit > 0 && actualStayNights != null
        ? Math.round(bookedTotal * (actualStayNights / bookedNights) * 100) / 100
        : bookedTotal;

    const { error: resError } = await auth.service
      .schema("hotel")
      .from("reservations")
      .update({
        status: "checked_out",
        checked_out_at: nowIso,
        departure_at: nowIso,
        ...(earlyCheckoutCredit > 0 && actualStayNights != null
          ? {
              nights: actualStayNights,
              total_room_charges: adjustedRoomTotal,
            }
          : {}),
      })
      .eq("id", reservation.id);

    if (resError) {
      return NextResponse.json({ error: "Could not complete checkout." }, { status: 500 });
    }

    let roomCode = body.roomCode?.trim() ?? "—";
    if (reservation.room_unit_id) {
      const { data: unit } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("room_code")
        .eq("id", reservation.room_unit_id)
        .maybeSingle();
      if (unit) roomCode = unit.room_code;

      await setRoomStatus(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: reservation.room_unit_id,
        status: "dirty",
        actorUserId: auth.user.id,
        roomCode,
        extra: { notes: body.notes ?? null },
      });

      await openOrEscalateHousekeepingTask(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: reservation.room_unit_id,
        taskType: "checkout_clean",
        reservationId: reservation.id,
      });
    }

    const { data: rg } = await auth.service
      .schema("hotel")
      .from("reservation_guests")
      .select("guests(first_name,last_name)")
      .eq("reservation_id", reservation.id)
      .eq("is_primary", true)
      .maybeSingle();

    type GuestEmbed = { first_name: string; last_name: string } | { first_name: string; last_name: string }[];
    const raw = rg?.guests as GuestEmbed | null;
    const guest = Array.isArray(raw) ? raw[0] : raw;
    const guestName = guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest";

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "checkout_completed",
      entityType: "reservation",
      entityId: reservation.id,
      after: { room_code: roomCode, status: "checked_out" },
    });

    await notifyCheckoutCompleted({
      tenantId: auth.tenant.id,
      guestName,
      roomCode,
      wasOverdue,
      entityId: reservation.id,
    });

    if (wasOverdue) {
      await notifyOverdueCheckout({
        tenantId: auth.tenant.id,
        guestName,
        roomCode,
        entityId: reservation.id,
      });
    }

    const commission = Number(reservation.commission_value);
    if (reservation.commission_plan && commission > 0) {
      await notifyCommissionDue({
        tenantId: auth.tenant.id,
        guestName,
        amount: commission,
        entityId: reservation.id,
      });
    }

    return NextResponse.json({
      ok: true,
      confirmationCode: reservation.confirmation_code,
      roomCode,
      earlyCheckoutCredit: earlyCheckoutCredit > 0 ? earlyCheckoutCredit : undefined,
      actualNights: actualStayNights ?? undefined,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Checkout failed." }, { status: 500 });
  }
}
