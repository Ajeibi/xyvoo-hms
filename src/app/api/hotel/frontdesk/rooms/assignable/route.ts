import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import {
  assertRoomAssignableWithBlocks,
  getActiveBlocksForRooms,
} from "@/lib/hms/rooms-ops";
import { mapRoomReadiness } from "@/lib/hms/arrivals-room";
import type { AssignableRoomOption } from "@/lib/hms/arrivals-workbench";

const QuerySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      reservationId: url.searchParams.get("reservationId"),
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: reservation } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,room_type_code,room_unit_id,status")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", query.reservationId)
      .maybeSingle();

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    const { data: units } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,floor,room_type_code,status")
      .eq("tenant_id", auth.tenant.id)
      .order("room_code");

    const unitIds = (units ?? []).map((u) => u.id);
    const blockMap = await getActiveBlocksForRooms(auth.service, auth.tenant.id, unitIds);

    const { data: hkRows } = await auth.service
      .schema("hotel")
      .from("housekeeping_tasks")
      .select("room_unit_id,status")
      .eq("tenant_id", auth.tenant.id)
      .in("room_unit_id", unitIds);

    const hkByRoom = new Map((hkRows ?? []).map((h) => [h.room_unit_id, h.status]));

    const { data: occupied } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("room_unit_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("status", "checked_in")
      .not("room_unit_id", "is", null);

    const occupiedIds = new Set(
      (occupied ?? [])
        .map((r) => r.room_unit_id)
        .filter((id) => id && id !== reservation.room_unit_id),
    );

    const assignableRooms: AssignableRoomOption[] = [];

    for (const unit of units ?? []) {
      if (occupiedIds.has(unit.id)) continue;
      if (reservation.room_type_code && unit.room_type_code !== reservation.room_type_code) {
        continue;
      }

      const blocks = blockMap.get(unit.id);
      const hkStatus = hkByRoom.get(unit.id);
      const check = assertRoomAssignableWithBlocks(unit, hkStatus, blocks);
      const readiness = mapRoomReadiness(unit.status, hkStatus);

      assignableRooms.push({
        id: unit.id,
        roomCode: unit.room_code,
        floor: unit.floor,
        roomTypeCode: unit.room_type_code,
        unitStatus: unit.status,
        readiness,
      });
    }

    return NextResponse.json({
      reservationId: reservation.id,
      roomTypeCode: reservation.room_type_code,
      currentRoomUnitId: reservation.room_unit_id,
      assignableRooms,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[rooms assignable]", e);
    return NextResponse.json({ error: "Failed to load assignable rooms." }, { status: 500 });
  }
}
