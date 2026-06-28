import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyMaintenance, notifyRoomReady, notifyRoomStatus } from "@/lib/hms/notification-rules";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

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

    const { error: updateError } = await auth.service
      .schema("hotel")
      .from("room_units")
      .update({
        status: body.status,
        notes: body.notes ?? unit.notes,
      })
      .eq("id", unit.id)
      .eq("tenant_id", auth.tenant.id);

    if (updateError) {
      return NextResponse.json({ error: "Could not update room." }, { status: 500 });
    }

    if (body.status === "dirty" || body.status === "ready_for_occupancy") {
      await auth.service.schema("hotel").from("housekeeping_tasks").upsert(
        {
          tenant_id: auth.tenant.id,
          room_unit_id: unit.id,
          status: body.status === "dirty" ? "dirty" : "ready",
          completed_at: body.status === "ready_for_occupancy" ? new Date().toISOString() : null,
        },
        { onConflict: "room_unit_id" },
      );
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_status_changed",
      entityType: "room_unit",
      entityId: unit.id,
      before: { status: unit.status, room_code: unit.room_code },
      after: { status: body.status, room_code: unit.room_code },
    });

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
