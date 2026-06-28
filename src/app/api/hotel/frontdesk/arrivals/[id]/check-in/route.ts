import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { assertRoomAssignable } from "@/lib/hms/arrivals-room";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { postRoomChargeOnCheckIn, verifyManagerPin } from "@/lib/hms/folio";
import { maybeEmitArrivalAlerts } from "@/lib/hms/arrivals-alerts";
import { mapRoomReadiness } from "@/lib/hms/arrivals-room";
import { getFolioForReservation } from "@/lib/hms/folio";
import { notifyVipArrival } from "@/lib/hms/notification-rules";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { bookingSourceLabel } from "@/lib/hms/front-desk-board";

const BodySchema = z.object({
  slug: z.string().min(1),
  checkedInByUserId: z.string().uuid(),
  roomUnitId: z.string().uuid().optional(),
  guestRemarks: z.string().max(2000).optional(),
  managerPin: z.string().optional(),
});

function num(value: string | number) {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: attendedMembership } = await auth.service
      .schema("hotel")
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("user_id", body.checkedInByUserId)
      .maybeSingle();

    if (!attendedMembership) {
      return NextResponse.json(
        { error: "Selected staff member is not part of this hotel." },
        { status: 400 },
      );
    }

    const guestSelect =
      "id,first_name,last_name,title,tags";

    const { data: reservation, error: resErr } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select(
        `id,confirmation_code,status,arrival_at,departure_at,nights,room_unit_id,room_type_code,total_room_charges,settlement_method,vip_flag,source,booking_channel,guest_remarks,reservation_guests(is_primary,guests(${guestSelect}))`,
      )
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (resErr || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (reservation.status !== "confirmed") {
      return NextResponse.json(
        { error: `Cannot check in reservation with status "${reservation.status}".` },
        { status: 400 },
      );
    }

    const roomUnitId = body.roomUnitId ?? reservation.room_unit_id;
    if (!roomUnitId) {
      return NextResponse.json({ error: "Assign a room before check-in." }, { status: 400 });
    }

    const { data: unit, error: unitErr } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,floor,room_type_code,status")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", roomUnitId)
      .maybeSingle();

    if (unitErr || !unit) {
      return NextResponse.json({ error: "Room not found." }, { status: 400 });
    }

    const { data: blocking } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", unit.id)
      .eq("status", "checked_in")
      .maybeSingle();

    if (blocking) {
      return NextResponse.json({ error: "Room is already occupied." }, { status: 400 });
    }

    const { data: hk } = await auth.service
      .schema("hotel")
      .from("housekeeping_tasks")
      .select("status")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", unit.id)
      .maybeSingle();

    const check = assertRoomAssignable(unit, hk?.status as string | undefined);
    if (!check.ok) {
      if (check.requiresOverride) {
        const allowed = await verifyManagerPin(
          auth.service,
          auth.tenant.id,
          body.managerPin,
          auth.role,
        );
        if (!allowed) {
          return NextResponse.json({ error: check.message, requiresPin: true }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: check.message }, { status: 400 });
      }
    }

    const nowIso = new Date().toISOString();
    const remarks =
      body.guestRemarks !== undefined ? body.guestRemarks : reservation.guest_remarks;

    const { error: updateErr } = await auth.service
      .schema("hotel")
      .from("reservations")
      .update({
        status: "checked_in",
        checked_in_at: nowIso,
        checked_in_by_staff_id: body.checkedInByUserId,
        room_unit_id: unit.id,
        room_type_code: unit.room_type_code,
        guest_remarks: remarks ?? null,
      })
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    await auth.service
      .schema("hotel")
      .from("room_units")
      .update({ status: "occupied" })
      .eq("id", unit.id)
      .eq("tenant_id", auth.tenant.id);

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "check_in",
      entityType: "reservation",
      entityId: id,
      after: { confirmation_code: reservation.confirmation_code, room_code: unit.room_code },
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "check_in",
      entityType: "room_unit",
      entityId: unit.id,
      after: { room_code: unit.room_code, status: "occupied" },
    });

    const totalCharges = num(reservation.total_room_charges);
    const { data: existingLines } = await auth.service
      .schema("hotel")
      .from("folio_transactions")
      .select("id,kind")
      .eq("tenant_id", auth.tenant.id)
      .eq("reservation_id", id)
      .eq("kind", "charge")
      .limit(1);

    if (!existingLines?.length) {
      await postRoomChargeOnCheckIn(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: id,
        totalRoomCharges: totalCharges,
        nights: reservation.nights,
        postedBy: auth.user.id,
      });
    }

    const embeds = reservation.reservation_guests as unknown as {
      is_primary: boolean;
      guests:
        | { first_name: string; last_name: string; title: string | null }
        | { first_name: string; last_name: string; title: string | null }[]
        | null;
    }[] | null;
    const primary = embeds?.find((e) => e.is_primary) ?? embeds?.[0];
    const rawG = primary?.guests;
    const g = Array.isArray(rawG) ? rawG[0] : rawG;
    const guestName = g
      ? `${g.title?.trim() ? `${g.title.trim()} ` : ""}${g.first_name} ${g.last_name}`.trim()
      : "Guest";

    if (reservation.vip_flag) {
      await notifyVipArrival({
        tenantId: auth.tenant.id,
        guestName,
        roomCode: unit.room_code,
        entityId: id,
      });
    }

    const currency = normalizePricingSetup(auth.tenant.pricing_setup).currency;
    const folio = await getFolioForReservation(auth.service, auth.tenant.id, id, {
      settlementMethod: reservation.settlement_method,
      totalRoomCharges: totalCharges,
      status: "checked_in",
    });
    await maybeEmitArrivalAlerts({
      supabase: auth.service,
      tenantId: auth.tenant.id,
      reservationId: id,
      guestName,
      confirmationCode: reservation.confirmation_code,
      status: "checked_in",
      arrivalAt: reservation.arrival_at,
      roomCode: unit.room_code,
      roomReadiness: mapRoomReadiness(unit.status, hk?.status as string | undefined),
      paymentStatus: folio.displayStatus,
      balance: folio.balance,
      currency,
    });

    return NextResponse.json({
      ok: true,
      confirmationCode: reservation.confirmation_code,
      roomCode: unit.room_code,
      bookingSourceLabel: bookingSourceLabel({
        source: reservation.source,
        booking_channel: reservation.booking_channel,
      }),
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[arrivals check-in]", e);
    return NextResponse.json({ error: "Check-in failed." }, { status: 500 });
  }
}
