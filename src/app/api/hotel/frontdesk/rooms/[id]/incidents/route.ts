import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const PostSchema = z.object({
  slug: z.string().min(1),
  incidentType: z.string().min(1).max(80),
  description: z.string().min(1).max(2000),
  reservationId: z.string().uuid().optional(),
});

const PatchSchema = z.object({
  slug: z.string().min(1),
  incidentId: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]).optional(),
  resolution: z.string().max(2000).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomUnitId } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canLogIncidents) {
      return NextResponse.json({ error: "Not allowed to log incidents." }, { status: 403 });
    }

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .eq("id", roomUnitId)
      .maybeSingle();

    const { data, error } = await auth.service
      .schema("hotel")
      .from("room_incidents")
      .insert({
        tenant_id: auth.tenant.id,
        room_unit_id: roomUnitId,
        reservation_id: body.reservationId ?? null,
        incident_type: body.incidentType,
        description: body.description,
        reported_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "incident_logged",
      entityType: "room_unit",
      entityId: roomUnitId,
      after: { incidentId: data.id, incidentType: body.incidentType },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "room_incident",
      title: "Room incident logged",
      body: `Room ${unit?.room_code ?? roomUnitId}: ${body.incidentType}`,
      severity: "warning",
      entityType: "room_unit",
      entityId: roomUnitId,
    });

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to log incident." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: roomUnitId } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canLogIncidents) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) updates.status = body.status;
    if (body.resolution !== undefined) updates.resolution = body.resolution;

    const { error } = await auth.service
      .schema("hotel")
      .from("room_incidents")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("room_unit_id", roomUnitId)
      .eq("id", body.incidentId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update incident." }, { status: 500 });
  }
}
