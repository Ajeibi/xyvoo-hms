import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { assignReservationToRoom } from "@/lib/hms/rooms-ops";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { verifyManagerPin } from "@/lib/hms/folio";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  roomUnitId: z.string().uuid().nullable(),
  reason: z.string().max(500).optional(),
  managerPin: z.string().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: targetRoomId } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canAssignRoom) {
      return NextResponse.json({ error: "Not allowed to assign rooms." }, { status: 403 });
    }

    if (body.roomUnitId && body.roomUnitId !== targetRoomId) {
      return NextResponse.json({ error: "Room mismatch." }, { status: 400 });
    }

    const result = await assignReservationToRoom({
      supabase: auth.service,
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
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
          reservationId: body.reservationId,
          roomUnitId: body.roomUnitId,
          allowDirtyOverride: true,
          allowBlockOverride: true,
        });
        if (!retry.ok) {
          return NextResponse.json({ error: retry.error }, { status: 400 });
        }
      } else {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_assignment_changed",
      entityType: "reservation",
      entityId: body.reservationId,
      after: {
        room_unit_id: body.roomUnitId,
        reason: body.reason ?? null,
        room_code: "roomCode" in result ? result.roomCode : null,
      },
    });

    return NextResponse.json({ ok: true, roomCode: "roomCode" in result ? result.roomCode : null });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[room assign]", e);
    return NextResponse.json({ error: "Assignment failed." }, { status: 500 });
  }
}
