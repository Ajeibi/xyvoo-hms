import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyRoomReady } from "@/lib/hms/notification-rules";

const STATUS_TO_ROOM: Record<string, string> = {
  dirty: "dirty",
  cleaning_in_progress: "cleaning_in_progress",
  cleaned: "dirty",
  inspected: "inspected",
  ready: "ready_for_occupancy",
};

const PatchSchema = z.object({
  slug: z.string().min(1),
  roomCode: z.string().min(1),
  status: z.enum(["dirty", "cleaning_in_progress", "cleaned", "inspected", "ready"]),
});

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,status")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_code", body.roomCode.trim())
      .maybeSingle();

    if (!unit) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    const now = new Date().toISOString();
    const taskPatch: Record<string, unknown> = {
      tenant_id: auth.tenant.id,
      room_unit_id: unit.id,
      status: body.status,
    };
    if (body.status === "cleaning_in_progress") taskPatch.started_at = now;
    if (body.status === "cleaned") taskPatch.completed_at = now;
    if (body.status === "inspected") taskPatch.inspected_at = now;

    await auth.service.schema("hotel").from("housekeeping_tasks").upsert(taskPatch, {
      onConflict: "room_unit_id",
    });

    const roomStatus = STATUS_TO_ROOM[body.status];
    if (roomStatus) {
      await auth.service
        .schema("hotel")
        .from("room_units")
        .update({ status: roomStatus })
        .eq("id", unit.id);
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "housekeeping_updated",
      entityType: "room_unit",
      entityId: unit.id,
      before: { status: unit.status, room_code: unit.room_code },
      after: { status: roomStatus, hk_status: body.status, room_code: unit.room_code },
    });

    if (body.status === "ready") {
      await notifyRoomReady({
        tenantId: auth.tenant.id,
        roomCode: unit.room_code,
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
