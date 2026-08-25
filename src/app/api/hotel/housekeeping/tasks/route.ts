import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import {
  HOUSEKEEPING_PRIORITY_LEVELS,
  HOUSEKEEPING_TASK_TYPES,
  openOrEscalateHousekeepingTask,
} from "@/lib/hms/housekeeping-tasks";
import { setRoomStatus } from "@/lib/hms/room-status";

/** Room statuses that mean "administratively unavailable for a different reason" — flipping
 * these to dirty would misrepresent why the room can't be sold, so a raised task leaves them
 * alone. Every other status (vacant_clean, inspected, ready_for_occupancy, occupied, already
 * dirty/cleaning, ...) gets pulled out of the "looks available" pool immediately. */
const ROOM_STATUS_UNTOUCHED_BY_TASK = ["maintenance", "out_of_order"];

const PostSchema = z.object({
  slug: z.string().min(1),
  roomCode: z.string().min(1).max(20),
  taskType: z.enum(HOUSEKEEPING_TASK_TYPES).default("deep_clean"),
  priorityLevel: z.enum(HOUSEKEEPING_PRIORITY_LEVELS).optional(),
  dueBy: z.string().datetime().optional(),
  notes: z.string().max(500).optional(),
  assignedNote: z.string().max(120).optional(),
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
      .select("id,room_code,status")
      .eq("tenant_id", auth.tenant.id)
      .eq("room_code", body.roomCode.trim())
      .maybeSingle();

    if (!unit) return NextResponse.json({ error: "Room not found." }, { status: 404 });

    // Raising a task must pull the room out of the "looks available" pool immediately — otherwise
    // Front Desk keeps offering it to new arrivals while a task is open. A guest's own check-in
    // status still takes priority in the room grid's display logic, so this is safe even for an
    // occupied room; only maintenance/out-of-order holds are left alone.
    if (!ROOM_STATUS_UNTOUCHED_BY_TASK.includes(unit.status)) {
      await setRoomStatus(auth.service, {
        tenantId: auth.tenant.id,
        roomUnitId: unit.id,
        status: "dirty",
        actorUserId: auth.user.id,
        roomCode: unit.room_code,
        previousStatus: unit.status,
      });
    }

    const { id, created } = await openOrEscalateHousekeepingTask(auth.service, {
      tenantId: auth.tenant.id,
      roomUnitId: unit.id,
      taskType: body.taskType,
      priorityLevel: body.priorityLevel,
      dueBy: body.dueBy ?? null,
      notes: body.notes ?? null,
      // Only touch assigned_note when the caller actually sent one — leaving it undefined means
      // "no opinion," so raising a duplicate request for an already-assigned room doesn't clobber
      // the existing assignee.
      assignedNote: body.assignedNote !== undefined ? body.assignedNote.trim() || null : undefined,
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
