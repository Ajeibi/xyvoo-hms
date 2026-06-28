import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const PatchSchema = z.object({
  slug: z.string().min(1),
  roomCode: z.string().min(1),
  dnd: z.boolean().optional(),
  securityHold: z.boolean().optional(),
  staffRestricted: z.boolean().optional(),
});

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_code", body.roomCode.trim())
      .maybeSingle();

    if (!unit) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    const { data: existing } = await auth.service
      .schema("hotel")
      .from("room_unit_flags")
      .select("dnd,security_hold,staff_restricted")
      .eq("room_unit_id", unit.id)
      .maybeSingle();

    const patch = {
      tenant_id: auth.tenant.id,
      room_unit_id: unit.id,
      dnd: body.dnd ?? existing?.dnd ?? false,
      security_hold: body.securityHold ?? existing?.security_hold ?? false,
      staff_restricted: body.staffRestricted ?? existing?.staff_restricted ?? false,
      updated_at: new Date().toISOString(),
    };

    const { error } = await auth.service.schema("hotel").from("room_unit_flags").upsert(patch, {
      onConflict: "room_unit_id",
    });

    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_flags_updated",
      entityType: "room_unit",
      entityId: unit.id,
      after: { room_code: unit.room_code, ...patch },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
