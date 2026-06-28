import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { assignReservationToRoom } from "@/lib/hms/rooms-ops";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { verifyManagerPin } from "@/lib/hms/folio";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  newRoomUnitId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  managerPin: z.string().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: fromRoomId } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canMoveGuest) {
      return NextResponse.json({ error: "Not allowed to move guests." }, { status: 403 });
    }

    const { data: reservation } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,confirmation_code,status,room_unit_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.reservationId)
      .maybeSingle();

    if (!reservation || reservation.status !== "checked_in") {
      return NextResponse.json({ error: "Only in-house stays can be moved." }, { status: 400 });
    }

    if (reservation.room_unit_id !== fromRoomId) {
      return NextResponse.json({ error: "Guest is not in this room." }, { status: 400 });
    }

    const assignResult = await assignReservationToRoom({
      supabase: auth.service,
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      roomUnitId: body.newRoomUnitId,
      allowDirtyOverride: caps.canOverrideDirty,
      allowBlockOverride: caps.canOverrideBlock,
    });

    if (!assignResult.ok) {
      if (assignResult.requiresPin) {
        const allowed = await verifyManagerPin(
          auth.service,
          auth.tenant.id,
          body.managerPin,
          auth.role,
        );
        if (!allowed) {
          return NextResponse.json(
            { error: assignResult.error, requiresPin: true },
            { status: 403 },
          );
        }
        const retry = await assignReservationToRoom({
          supabase: auth.service,
          tenantId: auth.tenant.id,
          reservationId: body.reservationId,
          roomUnitId: body.newRoomUnitId,
          allowDirtyOverride: true,
          allowBlockOverride: true,
        });
        if (!retry.ok) {
          return NextResponse.json({ error: retry.error }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: assignResult.error }, { status: 400 });
      }
    }

    await auth.service
      .schema("hotel")
      .from("room_units")
      .update({ status: "dirty" })
      .eq("id", fromRoomId);

    await auth.service
      .schema("hotel")
      .from("housekeeping_tasks")
      .upsert(
        {
          tenant_id: auth.tenant.id,
          room_unit_id: fromRoomId,
          status: "dirty",
        },
        { onConflict: "room_unit_id" },
      );

    await auth.service
      .schema("hotel")
      .from("room_units")
      .update({ status: "occupied" })
      .eq("id", body.newRoomUnitId);

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_moved",
      entityType: "reservation",
      entityId: body.reservationId,
      before: { room_unit_id: fromRoomId },
      after: { room_unit_id: body.newRoomUnitId, reason: body.reason },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "room_moved",
      title: "Guest moved",
      body: `Reservation ${reservation.confirmation_code} moved to another room.`,
      severity: "info",
      entityType: "reservation",
      entityId: body.reservationId,
    });

    return NextResponse.json({ ok: true, roomCode: assignResult.ok ? assignResult.roomCode : null });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[room move]", e);
    return NextResponse.json({ error: "Move failed." }, { status: 500 });
  }
}
