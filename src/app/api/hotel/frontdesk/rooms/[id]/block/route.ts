import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";
import { setRoomStatus } from "@/lib/hms/room-status";

const PostSchema = z.object({
  slug: z.string().min(1),
  blockType: z.enum(["temporary", "permanent", "soft", "maintenance_hold"]).default("temporary"),
  reason: z.string().min(1).max(200),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  notes: z.string().max(1000).optional(),
});

const PatchSchema = z.object({
  slug: z.string().min(1),
  blockId: z.string().uuid(),
  active: z.boolean().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canBlockRoom) {
      return NextResponse.json({ error: "Not allowed to block rooms." }, { status: 403 });
    }

    const { data, error } = await auth.service
      .schema("hotel")
      .from("room_blocks")
      .insert({
        tenant_id: auth.tenant.id,
        room_unit_id: id,
        block_type: body.blockType,
        reason: body.reason,
        start_at: body.startAt ?? new Date().toISOString(),
        end_at: body.endAt ?? null,
        notes: body.notes ?? null,
        created_by: auth.user.id,
        active: true,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("room_code,status")
      .eq("id", id)
      .maybeSingle();

    if (body.blockType !== "soft") {
      await setRoomStatus(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: id,
        status: "out_of_order",
        actorUserId: auth.user.id,
        roomCode: unit?.room_code,
        previousStatus: unit?.status,
      });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_blocked",
      entityType: "room_unit",
      entityId: id,
      after: { blockId: data.id, blockType: body.blockType, reason: body.reason },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "room_blocked",
      title: "Room blocked",
      body: `Room ${unit?.room_code ?? id}: ${body.reason}`,
      severity: "warning",
      entityType: "room_unit",
      entityId: id,
    });

    return NextResponse.json({ ok: true, blockId: data.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Block failed." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canBlockRoom) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.active !== undefined) updates.active = body.active;

    const { data: block } = await auth.service
      .schema("hotel")
      .from("room_blocks")
      .select("block_type")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", id)
      .eq("id", body.blockId)
      .maybeSingle();

    await auth.service
      .schema("hotel")
      .from("room_blocks")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", id)
      .eq("id", body.blockId);

    if (body.active === false) {
      // The matching POST only sets room_units.status to out_of_order for a non-"soft" block
      // (line ~60 above) — unblocking must undo exactly that, or the room stays stuck as
      // out-of-order forever with nothing else to ever move it out of that status. It comes back
      // as "dirty" rather than straight to available, since nobody has actually cleaned it since
      // the block was lifted; occupied rooms are left alone (a block shouldn't have coexisted
      // with an active stay, but this avoids clobbering real occupancy if it somehow did).
      if (block?.block_type !== "soft") {
        const { data: unit } = await auth.service
          .schema("hotel")
          .from("room_units")
          .select("room_code,status")
          .eq("id", id)
          .maybeSingle();
        if (unit && unit.status !== "occupied") {
          await setRoomStatus(auth.service, {
            tenantId: auth.tenant.id,
            roomUnitId: id,
            status: "dirty",
            actorUserId: auth.user.id,
            roomCode: unit.room_code,
            previousStatus: unit.status,
          });
        }
      }

      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "room_unblocked",
        entityType: "room_unit",
        entityId: id,
        after: { blockId: body.blockId },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
