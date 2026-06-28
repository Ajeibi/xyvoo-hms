import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { assignReservationToRoom } from "@/lib/hms/rooms-ops";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { verifyManagerPin } from "@/lib/hms/folio";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const BodySchema = z.object({
  slug: z.string().min(1),
  roomUnitId: z.string().uuid().nullable(),
  managerPin: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: reservation, error: resErr } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,confirmation_code,room_unit_id,status,room_type_code")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (resErr || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (!["confirmed", "checked_in"].includes(reservation.status)) {
      return NextResponse.json(
        { error: "Room can only be assigned to confirmed or in-house stays." },
        { status: 400 },
      );
    }

    const caps = getRoomsCapabilities(auth.role);

    const result = await assignReservationToRoom({
      supabase: auth.service,
      tenantId: auth.tenant.id,
      reservationId: id,
      roomUnitId: body.roomUnitId,
      allowDirtyOverride: caps.canOverrideDirty,
      allowBlockOverride: caps.canOverrideBlock,
    });

    if (!result.ok) {
      if (result.requiresPin) {
        const allowed = await verifyManagerPin(
          auth.service,
          auth.tenant.id,
          body.managerPin,
          auth.role,
        );
        if (!allowed) {
          return NextResponse.json({ error: result.error, requiresPin: true }, { status: 403 });
        }
        const retry = await assignReservationToRoom({
          supabase: auth.service,
          tenantId: auth.tenant.id,
          reservationId: id,
          roomUnitId: body.roomUnitId,
          allowDirtyOverride: true,
          allowBlockOverride: true,
        });
        if (!retry.ok) {
          return NextResponse.json({ error: retry.error }, { status: 400 });
        }
        await writeAuditLog({
          tenantId: auth.tenant.id,
          actorUserId: auth.user.id,
          action: body.roomUnitId ? "room_assigned" : "room_unassigned",
          entityType: "reservation",
          entityId: id,
          before: { room_unit_id: reservation.room_unit_id },
          after: {
            room_unit_id: body.roomUnitId,
            room_code: "roomCode" in retry ? retry.roomCode : null,
          },
        });
        return NextResponse.json({
          ok: true,
          roomCode: "roomCode" in retry ? retry.roomCode : null,
        });
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.roomUnitId ? "room_assigned" : "room_unassigned",
      entityType: "reservation",
      entityId: id,
      before: { room_unit_id: reservation.room_unit_id },
      after: {
        room_unit_id: body.roomUnitId,
        room_code: "roomCode" in result ? result.roomCode : null,
      },
    });

    return NextResponse.json({
      ok: true,
      roomCode: "roomCode" in result ? result.roomCode : null,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[assign-room]", e);
    return NextResponse.json({ error: "Assignment failed." }, { status: 500 });
  }
}
