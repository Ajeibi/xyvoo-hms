import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyInspectionFailed, notifyRoomReady } from "@/lib/hms/notification-rules";
import { getTenantHousekeepingSettings } from "@/lib/hms/housekeeping-settings";

export const HOUSEKEEPING_TASK_TYPES = [
  "checkout_clean",
  "stayover",
  "deep_clean",
  "turndown",
  "reinspection",
] as const;
export type HousekeepingTaskType = (typeof HOUSEKEEPING_TASK_TYPES)[number];

export const HOUSEKEEPING_TASK_STATUSES = [
  "dirty",
  "cleaning_in_progress",
  "cleaned",
  "inspected",
  "ready",
] as const;
export type HousekeepingTaskStatus = (typeof HOUSEKEEPING_TASK_STATUSES)[number];

export const HOUSEKEEPING_PRIORITY_LEVELS = ["normal", "high", "urgent", "vip"] as const;
export type HousekeepingPriorityLevel = (typeof HOUSEKEEPING_PRIORITY_LEVELS)[number];

/** Mirrors (and extends) the STATUS_TO_ROOM mapping that used to live only in the PATCH route. */
const STATUS_TO_ROOM: Record<HousekeepingTaskStatus, string> = {
  dirty: "dirty",
  cleaning_in_progress: "cleaning_in_progress",
  cleaned: "dirty",
  inspected: "inspected",
  ready: "ready_for_occupancy",
};

/**
 * `vacant_clean` and `ready_for_occupancy` already mean the same thing ("clean and
 * available") in several existing files (front-desk-board.ts, arrivals-room.ts). Housekeeping
 * treats both as equivalent wherever it reads "is this room available" (HK-08) rather than
 * silently diverging from how the rest of the app already copes with the duplication.
 */
export const ROOM_AVAILABLE_STATUSES = ["vacant_clean", "ready_for_occupancy"] as const;

const NEXT_STATUS: Record<HousekeepingTaskStatus, HousekeepingTaskStatus | null> = {
  dirty: "cleaning_in_progress",
  cleaning_in_progress: "cleaned",
  cleaned: "inspected",
  inspected: "ready",
  ready: null,
};

export function canTransitionTaskStatus(from: string, to: string): boolean {
  return NEXT_STATUS[from as HousekeepingTaskStatus] === to;
}

export type HousekeepingTaskRow = {
  id: string;
  tenantId: string;
  roomUnitId: string;
  roomCode: string;
  roomTypeCode: string | null;
  floor: number;
  taskType: HousekeepingTaskType;
  status: HousekeepingTaskStatus;
  priorityLevel: HousekeepingPriorityLevel;
  dueBy: string | null;
  reservationId: string | null;
  assignedStaffId: string | null;
  assignedStaffName: string | null;
  startedAt: string | null;
  completedAt: string | null;
  inspectedAt: string | null;
  inspectedBy: string | null;
  inspectionResult: "pass" | "fail" | null;
  notes: string | null;
  createdAt: string;
};

type RawTaskRow = {
  id: string;
  tenant_id: string;
  room_unit_id: string;
  task_type: string;
  status: string;
  priority_level: string;
  due_by: string | null;
  reservation_id: string | null;
  assigned_staff_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  inspected_at: string | null;
  inspected_by: string | null;
  inspection_result: string | null;
  notes: string | null;
  created_at: string;
};

const TASK_COLUMNS =
  "id,tenant_id,room_unit_id,task_type,status,priority_level,due_by,reservation_id,assigned_staff_id,started_at,completed_at,inspected_at,inspected_by,inspection_result,notes,created_at";

async function hydrateTasks(
  service: SupabaseClient,
  tenantId: string,
  rows: RawTaskRow[],
): Promise<HousekeepingTaskRow[]> {
  if (rows.length === 0) return [];

  const roomIds = [...new Set(rows.map((r) => r.room_unit_id))];
  const staffIds = [...new Set(rows.map((r) => r.assigned_staff_id).filter((x): x is string => Boolean(x)))];

  const [{ data: rooms }, { data: profiles }] = await Promise.all([
    service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,floor,room_type_code")
      .eq("tenant_id", tenantId)
      .in("id", roomIds),
    staffIds.length > 0
      ? service.schema("hotel").from("profiles").select("user_id,contact_name").eq("tenant_id", tenantId).in("user_id", staffIds)
      : Promise.resolve({ data: [] as { user_id: string; contact_name: string | null }[] }),
  ]);

  const roomById = new Map<string, { room_code: string; floor: number; room_type_code: string | null }>();
  for (const r of (rooms ?? []) as { id: string; room_code: string; floor: number; room_type_code: string | null }[]) {
    roomById.set(r.id, { room_code: r.room_code, floor: r.floor, room_type_code: r.room_type_code });
  }
  const nameByUserId = new Map<string, string>();
  for (const p of (profiles ?? []) as { user_id: string; contact_name: string | null }[]) {
    if (p.contact_name) nameByUserId.set(p.user_id, p.contact_name);
  }

  return rows.map((r) => {
    const room = roomById.get(r.room_unit_id);
    return {
      id: r.id,
      tenantId: r.tenant_id,
      roomUnitId: r.room_unit_id,
      roomCode: room?.room_code ?? "—",
      roomTypeCode: room?.room_type_code ?? null,
      floor: room?.floor ?? 0,
      taskType: r.task_type as HousekeepingTaskType,
      status: r.status as HousekeepingTaskStatus,
      priorityLevel: (r.priority_level as HousekeepingPriorityLevel) ?? "normal",
      dueBy: r.due_by,
      reservationId: r.reservation_id,
      assignedStaffId: r.assigned_staff_id,
      assignedStaffName: r.assigned_staff_id ? nameByUserId.get(r.assigned_staff_id) ?? "Staff" : null,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      inspectedAt: r.inspected_at,
      inspectedBy: r.inspected_by,
      inspectionResult: r.inspection_result as "pass" | "fail" | null,
      notes: r.notes,
      createdAt: r.created_at,
    };
  });
}

/** Live board / "today's open tasks" — replaces the old flat "last 50 tasks ever" list. */
export async function listOpenHousekeepingTasks(
  service: SupabaseClient,
  tenantId: string,
): Promise<HousekeepingTaskRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select(TASK_COLUMNS)
    .eq("tenant_id", tenantId)
    .neq("status", "ready")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = await hydrateTasks(service, tenantId, (data ?? []) as RawTaskRow[]);
  return sortByPriorityThenDue(rows);
}

export async function listMyHousekeepingTasks(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<HousekeepingTaskRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select(TASK_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("assigned_staff_id", userId)
    .neq("status", "ready")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = await hydrateTasks(service, tenantId, (data ?? []) as RawTaskRow[]);
  return sortByPriorityThenDue(rows);
}

export async function listInspectionQueue(
  service: SupabaseClient,
  tenantId: string,
): Promise<HousekeepingTaskRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select(TASK_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "cleaned")
    .order("completed_at", { ascending: true });
  if (error) throw new Error(error.message);

  return hydrateTasks(service, tenantId, (data ?? []) as RawTaskRow[]);
}

const PRIORITY_WEIGHT: Record<HousekeepingPriorityLevel, number> = { vip: 0, urgent: 1, high: 2, normal: 3 };

function sortByPriorityThenDue(rows: HousekeepingTaskRow[]): HousekeepingTaskRow[] {
  return [...rows].sort((a, b) => {
    const pw = PRIORITY_WEIGHT[a.priorityLevel] - PRIORITY_WEIGHT[b.priorityLevel];
    if (pw !== 0) return pw;
    const aDue = a.dueBy ? new Date(a.dueBy).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueBy ? new Date(b.dueBy).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

/**
 * Open-or-create a task for a room. Reused by Front Desk's checkout and priority-clean
 * actions (which used to do a raw `.upsert(..., {onConflict: 'room_unit_id'})` against the
 * old permanent-unique-row model) and by run-sheet generation. Never creates a second open
 * task for the same room — the partial unique index backs this up at the DB layer too.
 */
export async function openOrEscalateHousekeepingTask(
  service: SupabaseClient,
  params: {
    tenantId: string;
    roomUnitId: string;
    taskType: HousekeepingTaskType;
    reservationId?: string | null;
    priorityLevel?: HousekeepingPriorityLevel;
    dueBy?: string | null;
    notes?: string | null;
  },
): Promise<{ id: string; created: boolean }> {
  const { data: existing } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("room_unit_id", params.roomUnitId)
    .neq("status", "ready")
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (params.priorityLevel) patch.priority_level = params.priorityLevel;
    if (params.dueBy !== undefined) patch.due_by = params.dueBy;
    if (params.notes !== undefined) patch.notes = params.notes;
    if (params.reservationId !== undefined) patch.reservation_id = params.reservationId;
    if (Object.keys(patch).length > 0) {
      await service.schema("hotel").from("housekeeping_tasks").update(patch).eq("id", existing.id);
    }
    return { id: existing.id as string, created: false };
  }

  const { data: inserted, error } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .insert({
      tenant_id: params.tenantId,
      room_unit_id: params.roomUnitId,
      task_type: params.taskType,
      status: "dirty",
      priority_level: params.priorityLevel ?? "normal",
      due_by: params.dueBy ?? null,
      reservation_id: params.reservationId ?? null,
      notes: params.notes ?? null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return { id: inserted.id as string, created: true };
}

/** Core status machine: advances a task and keeps `room_units.status` in lockstep (HK-06/07). */
export async function transitionHousekeepingTaskStatus(
  service: SupabaseClient,
  params: {
    tenantId: string;
    taskId: string;
    toStatus: HousekeepingTaskStatus;
    actorUserId: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: task } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id,status,room_unit_id,task_type")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.taskId)
    .maybeSingle();

  if (!task) return { ok: false, error: "Task not found." };
  if (!canTransitionTaskStatus(task.status as string, params.toStatus)) {
    return { ok: false, error: `Cannot move from ${task.status} to ${params.toStatus}.` };
  }
  if (params.toStatus === "inspected" || params.toStatus === "ready") {
    return { ok: false, error: "Use the inspection endpoint to move a task past 'cleaned'." };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: params.toStatus };
  if (params.toStatus === "cleaning_in_progress") patch.started_at = now;
  if (params.toStatus === "cleaned") patch.completed_at = now;

  await service.schema("hotel").from("housekeeping_tasks").update(patch).eq("id", task.id);

  const { data: unit } = await service
    .schema("hotel")
    .from("room_units")
    .select("id,room_code,status")
    .eq("id", task.room_unit_id)
    .maybeSingle();

  if (unit) {
    await service
      .schema("hotel")
      .from("room_units")
      .update({ status: STATUS_TO_ROOM[params.toStatus] })
      .eq("id", unit.id);

    await writeAuditLog({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: "housekeeping_task_advanced",
      entityType: "housekeeping_task",
      entityId: task.id,
      before: { status: task.status },
      after: { status: params.toStatus, room_code: unit.room_code },
    });
  }

  return { ok: true };
}

/**
 * Inspection sign-off (HK-19/20). Pass closes the task (`ready`, room synced to
 * `ready_for_occupancy`). Fail reopens it as a `reinspection` task rather than silently
 * resetting status, and never lets the assigned attendant inspect their own work unless
 * self-inspection is explicitly enabled in settings.
 */
export async function inspectHousekeepingTask(
  service: SupabaseClient,
  params: {
    tenantId: string;
    taskId: string;
    inspectorUserId: string;
    result: "pass" | "fail";
    note?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: task } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id,status,room_unit_id,assigned_staff_id,notes")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.taskId)
    .maybeSingle();

  if (!task) return { ok: false, error: "Task not found." };
  if (task.status !== "cleaned") return { ok: false, error: "Only a cleaned task can be inspected." };

  const settings = await getTenantHousekeepingSettings(service, params.tenantId);
  if (
    task.assigned_staff_id === params.inspectorUserId &&
    !settings.selfInspectionAllowed
  ) {
    return { ok: false, error: "The assigned attendant cannot inspect their own work." };
  }

  const now = new Date().toISOString();

  if (params.result === "fail") {
    await service
      .schema("hotel")
      .from("housekeeping_tasks")
      .update({
        status: "dirty",
        task_type: "reinspection",
        inspected_at: now,
        inspected_by: params.inspectorUserId,
        inspection_result: "fail",
        notes: params.note ? `${task.notes ? `${task.notes}\n` : ""}Inspection failed: ${params.note}` : task.notes,
        started_at: null,
        completed_at: null,
      })
      .eq("id", task.id);

    await service.schema("hotel").from("room_units").update({ status: "dirty" }).eq("id", task.room_unit_id);

    await writeAuditLog({
      tenantId: params.tenantId,
      actorUserId: params.inspectorUserId,
      action: "housekeeping_inspection_failed",
      entityType: "housekeeping_task",
      entityId: task.id,
      after: { note: params.note ?? null },
    });

    const { data: failedUnit } = await service
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .eq("id", task.room_unit_id)
      .maybeSingle();
    if (failedUnit) {
      await notifyInspectionFailed({
        tenantId: params.tenantId,
        entityId: task.id,
        roomCode: failedUnit.room_code,
        note: params.note,
      });
    }

    return { ok: true };
  }

  await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .update({
      status: "ready",
      inspected_at: now,
      inspected_by: params.inspectorUserId,
      inspection_result: "pass",
    })
    .eq("id", task.id);

  const { data: unit } = await service
    .schema("hotel")
    .from("room_units")
    .select("id,room_code")
    .eq("id", task.room_unit_id)
    .maybeSingle();

  if (unit) {
    await service.schema("hotel").from("room_units").update({ status: "ready_for_occupancy" }).eq("id", unit.id);

    await writeAuditLog({
      tenantId: params.tenantId,
      actorUserId: params.inspectorUserId,
      action: "housekeeping_inspection_passed",
      entityType: "housekeeping_task",
      entityId: task.id,
    });

    await notifyRoomReady({ tenantId: params.tenantId, entityId: unit.id, roomCode: unit.room_code });
  }

  return { ok: true };
}

export async function assignHousekeepingTask(
  service: SupabaseClient,
  params: { tenantId: string; taskId: string; staffUserId: string | null; actorUserId: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.staffUserId) {
    const { data: membership } = await service
      .schema("hotel")
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.staffUserId)
      .maybeSingle();
    if (!membership) return { ok: false, error: "That staff member is not a member of this property." };
  }

  await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .update({ assigned_staff_id: params.staffUserId })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.taskId);

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "housekeeping_task_assigned",
    entityType: "housekeeping_task",
    entityId: params.taskId,
    after: { assigned_staff_id: params.staffUserId },
  });

  return { ok: true };
}

/**
 * Room-status guard (HK-07): if a room is taken out of service directly (maintenance /
 * out_of_order) outside the Housekeeping status machine, pause any open task with a system
 * note rather than continuing to prompt an attendant to clean an unsellable room.
 */
export async function pauseHousekeepingTaskForRoom(
  service: SupabaseClient,
  params: { tenantId: string; roomUnitId: string; reason: string },
) {
  const { data: task } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id,notes")
    .eq("tenant_id", params.tenantId)
    .eq("room_unit_id", params.roomUnitId)
    .neq("status", "ready")
    .maybeSingle();

  if (!task) return;

  await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .update({
      notes: `${task.notes ? `${task.notes}\n` : ""}Paused: ${params.reason}`,
    })
    .eq("id", task.id);
}

/**
 * Manual override path: Front Desk marking a room `dirty` or `ready_for_occupancy` directly
 * from the room-status control (outside the attendant/inspection workflow). Keeps the same
 * task row in sync rather than leaving it orphaned relative to `room_units.status`.
 */
export async function syncHousekeepingTaskForManualRoomStatus(
  service: SupabaseClient,
  params: { tenantId: string; roomUnitId: string; roomStatus: "dirty" | "ready_for_occupancy" },
) {
  if (params.roomStatus === "dirty") {
    await openOrEscalateHousekeepingTask(service, {
      tenantId: params.tenantId,
      roomUnitId: params.roomUnitId,
      taskType: "checkout_clean",
    });
    return;
  }

  const { data: task } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id")
    .eq("tenant_id", params.tenantId)
    .eq("room_unit_id", params.roomUnitId)
    .neq("status", "ready")
    .maybeSingle();

  if (!task) return;

  await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .update({ status: "ready", completed_at: new Date().toISOString() })
    .eq("id", task.id);
}

export type HousekeepingGuestRequest = {
  id: string;
  requestType: string;
  details: string | null;
  priority: string;
};

/**
 * HK-09: guest-service requests already routed to `department = 'housekeeping'` for this
 * task's reservation (extra towels, turndown, hypoallergenic bedding, etc.), surfaced as a
 * checklist rather than relayed by phone between departments.
 */
export async function getOpenGuestRequestsForReservation(
  service: SupabaseClient,
  tenantId: string,
  reservationId: string | null,
): Promise<HousekeepingGuestRequest[]> {
  if (!reservationId) return [];

  const { data, error } = await service
    .schema("hotel")
    .from("guest_requests")
    .select("id,request_type,details,priority,status")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("department", "housekeeping")
    .not("status", "in", "(completed,cancelled)");

  if (error) throw new Error(error.message);

  return ((data ?? []) as { id: string; request_type: string; details: string | null; priority: string }[]).map(
    (r) => ({ id: r.id, requestType: r.request_type, details: r.details, priority: r.priority }),
  );
}

export type RunSheetResult = {
  created: number;
  skippedDnd: number;
  skippedHold: number;
  skippedMaintenance: number;
};

/**
 * Generates today's stayover tasks (HK-01) for occupied rooms due for service per the
 * configured cadence, honoring DND/security-hold/staff-restricted flags and rooms already
 * out of service (HK-04). Checkout tasks are created inline at the moment of checkout
 * (Front Desk's checkout route) rather than batched here.
 */
export async function generateStayoverRunSheet(
  service: SupabaseClient,
  tenantId: string,
): Promise<RunSheetResult> {
  const settings = await getTenantHousekeepingSettings(service, tenantId);
  const result: RunSheetResult = { created: 0, skippedDnd: 0, skippedHold: 0, skippedMaintenance: 0 };

  const { data: rooms } = await service
    .schema("hotel")
    .from("room_units")
    .select("id,status")
    .eq("tenant_id", tenantId);

  const roomStatusById = new Map<string, string>();
  for (const r of (rooms ?? []) as { id: string; status: string }[]) roomStatusById.set(r.id, r.status);

  const { data: reservations } = await service
    .schema("hotel")
    .from("reservations")
    .select("id,room_unit_id,checked_in_at")
    .eq("tenant_id", tenantId)
    .eq("status", "checked_in");

  const { data: flags } = await service
    .schema("hotel")
    .from("room_unit_flags")
    .select("room_unit_id,dnd,security_hold,staff_restricted")
    .eq("tenant_id", tenantId);

  const flagByRoom = new Map<string, { dnd: boolean; security_hold: boolean; staff_restricted: boolean }>();
  for (const f of (flags ?? []) as { room_unit_id: string; dnd: boolean; security_hold: boolean; staff_restricted: boolean }[]) {
    flagByRoom.set(f.room_unit_id, f);
  }

  const { data: openTasks } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("room_unit_id")
    .eq("tenant_id", tenantId)
    .neq("status", "ready");

  const roomsWithOpenTask = new Set((openTasks ?? []).map((t) => (t as { room_unit_id: string }).room_unit_id));

  for (const res of (reservations ?? []) as { id: string; room_unit_id: string | null; checked_in_at: string | null }[]) {
    if (!res.room_unit_id) continue;
    if (roomsWithOpenTask.has(res.room_unit_id)) continue;

    const roomStatus = roomStatusById.get(res.room_unit_id);
    if (roomStatus === "maintenance" || roomStatus === "out_of_order") {
      result.skippedMaintenance += 1;
      continue;
    }

    const flag = flagByRoom.get(res.room_unit_id);
    if (flag?.dnd) {
      result.skippedDnd += 1;
      continue;
    }
    if (flag?.security_hold || flag?.staff_restricted) {
      result.skippedHold += 1;
      continue;
    }

    const daysSinceCheckIn = res.checked_in_at
      ? Math.floor((Date.now() - new Date(res.checked_in_at).getTime()) / (24 * 60 * 60 * 1000))
      : 0;
    const due = daysSinceCheckIn > 0 && daysSinceCheckIn % settings.stayoverCadenceDays === 0;
    if (!due) continue;

    await openOrEscalateHousekeepingTask(service, {
      tenantId,
      roomUnitId: res.room_unit_id,
      taskType: "stayover",
      reservationId: res.id,
    });
    result.created += 1;
  }

  return result;
}
