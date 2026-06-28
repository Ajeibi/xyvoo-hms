import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const BodySchema = z.object({
  slug: z.string().min(1),
  priorityLevel: z.enum(["normal", "high", "urgent", "vip"]).default("urgent"),
  dueBy: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canPriorityClean) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .eq("id", id)
      .maybeSingle();

    await auth.service
      .schema("hotel")
      .from("housekeeping_tasks")
      .upsert(
        {
          tenant_id: auth.tenant.id,
          room_unit_id: id,
          status: "dirty",
          priority_level: body.priorityLevel,
          due_by: body.dueBy ?? null,
          notes: body.notes ?? null,
        },
        { onConflict: "room_unit_id" },
      );

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_priority_clean",
      entityType: "room_unit",
      entityId: id,
      after: { priorityLevel: body.priorityLevel },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "priority_clean",
      title: "Priority clean requested",
      body: `Room ${unit?.room_code ?? id} flagged ${body.priorityLevel} priority.`,
      severity: body.priorityLevel === "vip" || body.priorityLevel === "urgent" ? "warning" : "info",
      entityType: "room_unit",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Request failed." }, { status: 500 });
  }
}
