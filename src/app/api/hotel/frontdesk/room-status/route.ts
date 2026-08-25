import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { notifyMaintenance, notifyRoomReady, notifyRoomStatus } from "@/lib/hms/notification-rules";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";
import { pauseHousekeepingTaskForRoom, syncHousekeepingTaskForManualRoomStatus } from "@/lib/hms/housekeeping-tasks";
import { setRoomStatus } from "@/lib/hms/room-status";

const PatchSchema = z.object({
  slug: z.string().min(1),
  roomCode: z.string().min(1).max(20),
  status: z.enum([
    "vacant_clean",
    "dirty",
    "inspected",
    "maintenance",
    "out_of_order",
    "cleaning_in_progress",
    "ready_for_occupancy",
    "occupied",
  ]),
  notes: z.string().max(500).optional(),
});

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canChangeRoomStatus) {
      return NextResponse.json({ error: "You do not have permission to change room status." }, { status: 403 });
    }

    const { data: unit, error: findError } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,status,notes")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_code", body.roomCode.trim())
      .maybeSingle();

    if (findError || !unit) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    const { data: inHouseStay } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", unit.id)
      .eq("status", "checked_in")
      .limit(1)
      .maybeSingle();

    if (inHouseStay) {
      const allowedWithGuest = new Set(["dirty", "cleaning_in_progress", "occupied", unit.status]);
      if (!allowedWithGuest.has(body.status)) {
        return NextResponse.json(
          {
            error:
              "While a guest is checked in, only Dirty, Cleaning in progress, or Occupied (or keeping the current status) is allowed.",
          },
          { status: 400 },
        );
      }
    }

    const result = await setRoomStatus(auth.service, {
      tenantId: auth.tenant.id,
      roomUnitId: unit.id,
      status: body.status,
      actorUserId: auth.user.id,
      roomCode: unit.room_code,
      previousStatus: unit.status,
      extra: { notes: body.notes ?? unit.notes },
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Could not update room." }, { status: 500 });
    }

    if (body.status === "dirty" || body.status === "ready_for_occupancy") {
      await syncHousekeepingTaskForManualRoomStatus(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: unit.id,
        roomStatus: body.status,
      });
    } else if (body.status === "maintenance" || body.status === "out_of_order") {
      // HK-07: taking a room out of service outside the HK status machine pauses any open task
      // rather than continuing to prompt an attendant to clean a room that is no longer sellable.
      await pauseHousekeepingTaskForRoom(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: unit.id,
        reason: `Room set to ${body.status.replace(/_/g, " ")} by Front Desk.`,
      });
    }

    const statusLabel = body.status.replace(/_/g, " ");
    if (body.status === "maintenance") {
      await notifyMaintenance({
        tenantId: auth.tenant.id,
        roomCode: unit.room_code,
        notes: body.notes,
        entityId: unit.id,
      });
    } else if (body.status === "ready_for_occupancy") {
      await notifyRoomReady({
        tenantId: auth.tenant.id,
        roomCode: unit.room_code,
        entityId: unit.id,
      });
    } else {
      await notifyRoomStatus({
        tenantId: auth.tenant.id,
        roomCode: unit.room_code,
        statusLabel,
        entityId: unit.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
