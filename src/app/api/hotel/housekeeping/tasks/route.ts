import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { HOUSEKEEPING_PRIORITY_LEVELS, HOUSEKEEPING_TASK_TYPES, openOrEscalateHousekeepingTask } from "@/lib/hms/housekeeping-tasks";

const PostSchema = z.object({
  slug: z.string().min(1),
  roomCode: z.string().min(1).max(20),
  taskType: z.enum(HOUSEKEEPING_TASK_TYPES).default("deep_clean"),
  priorityLevel: z.enum(HOUSEKEEPING_PRIORITY_LEVELS).optional(),
  dueBy: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
});

/** Manual/ad-hoc task creation (HK-05) — e.g. a spill reported in an occupied stayover room. */
export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canCreateManualTask) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_code", body.roomCode.trim())
      .maybeSingle();

    if (!unit) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    const { id, created } = await openOrEscalateHousekeepingTask(auth.service, {
      tenantId: auth.tenant.id,
      roomUnitId: unit.id,
      taskType: body.taskType,
      priorityLevel: body.priorityLevel,
      dueBy: body.dueBy ?? null,
      notes: body.notes ?? null,
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "housekeeping_task_created",
      entityType: "housekeeping_task",
      entityId: id,
      after: { room_code: unit.room_code, task_type: body.taskType },
    });

    return NextResponse.json({ ok: true, id, created });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping tasks POST]", e);
    return NextResponse.json({ error: "Failed to create task." }, { status: 500 });
  }
}
