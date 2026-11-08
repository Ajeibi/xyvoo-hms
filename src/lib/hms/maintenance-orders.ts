import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { sendAlert } from "@/lib/hms/alerts";
import { getMaintenanceSettings } from "@/lib/hms/maintenance-settings";
import { releaseRoomForOrder } from "@/lib/hms/maintenance-rooms";
import {
  OPEN_STATUSES,
  WO_PRIORITIES,
  WO_SOURCES,
  canMove,
  isOverdue,
  slaDueAt,
  type WoPriority,
  type WoSource,
  type WoStatus,
  type WorkOrder,
  type WorkOrderEvent,
  type WorkOrderPart,
} from "@/lib/hms/maintenance-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const n = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

export type Actor = { userId: string | null; name: string | null };

export async function addEvent(
  service: SupabaseClient,
  tenantId: string,
  workOrderId: string,
  kind: string,
  body: string | null,
  actor: Actor,
) {
  const { error } = await service.schema("hotel").from("maintenance_work_order_events").insert({
    tenant_id: tenantId,
    work_order_id: workOrderId,
    kind,
    body,
    actor_user_id: actor.userId,
    actor_name: actor.name,
  });
  if (error) console.warn("[maintenance addEvent]", error.message);
}

async function lookups(service: SupabaseClient, tenantId: string, rows: any[]) {
  const ids = (key: string) => [...new Set(rows.map((r) => r[key]).filter(Boolean))] as string[];
  const [rooms, techs, assets] = await Promise.all([
    ids("room_unit_id").length
      ? service.schema("hotel").from("room_units").select("id, room_code").eq("tenant_id", tenantId).in("id", ids("room_unit_id"))
      : Promise.resolve({ data: [] as any[] }),
    ids("technician_id").length
      ? service.schema("hotel").from("maintenance_technicians").select("id, name").eq("tenant_id", tenantId).in("id", ids("technician_id"))
      : Promise.resolve({ data: [] as any[] }),
    ids("asset_id").length
      ? service.schema("hotel").from("maintenance_assets").select("id, name").eq("tenant_id", tenantId).in("id", ids("asset_id"))
      : Promise.resolve({ data: [] as any[] }),
  ]);
  return {
    room: new Map((rooms.data ?? []).map((r: any) => [r.id as string, r.room_code as string])),
    tech: new Map((techs.data ?? []).map((r: any) => [r.id as string, r.name as string])),
    asset: new Map((assets.data ?? []).map((r: any) => [r.id as string, r.name as string])),
  };
}

function mapRow(r: any, l: Awaited<ReturnType<typeof lookups>>): WorkOrder {
  return {
    id: r.id,
    woNumber: r.wo_number,
    title: r.title,
    description: r.description ?? null,
    category: r.category ?? null,
    priority: r.priority,
    status: r.status,
    source: r.source,
    roomUnitId: r.room_unit_id ?? null,
    roomCode: r.room_unit_id ? (l.room.get(r.room_unit_id) ?? null) : null,
    locationText: r.location_text ?? null,
    assetId: r.asset_id ?? null,
    assetName: r.asset_id ? (l.asset.get(r.asset_id) ?? null) : null,
    scheduleId: r.schedule_id ?? null,
    technicianId: r.technician_id ?? null,
    technicianName: r.technician_id ? (l.tech.get(r.technician_id) ?? null) : null,
    reportedByName: r.reported_by_name ?? null,
    slaDueAt: r.sla_due_at ?? null,
    assignedAt: r.assigned_at ?? null,
    startedAt: r.started_at ?? null,
    completedAt: r.completed_at ?? null,
    holdReason: r.hold_reason ?? null,
    resolutionNotes: r.resolution_notes ?? null,
    labourMinutes: n(r.labour_minutes),
    partsCost: n(r.parts_cost),
    roomBlockId: r.room_block_id ?? null,
    tookRoomOutOfOrder: Boolean(r.took_room_out_of_order),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export type CreateWorkOrderInput = {
  tenantId: string;
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: WoPriority;
  source?: WoSource;
  roomUnitId?: string | null;
  locationText?: string | null;
  assetId?: string | null;
  technicianId?: string | null;
  reportedByName?: string | null;
  /** The calling system's own reference; a repeat call with the same one returns the same order. */
  externalRef?: string | null;
  scheduleId?: string | null;
  scheduleDueOn?: string | null;
  actor: Actor;
};

export async function createWorkOrder(
  service: SupabaseClient,
  input: CreateWorkOrderInput,
): Promise<{ error: string | null; workOrder: WorkOrder | null; existing?: boolean }> {
  const title = input.title.trim();
  if (!title) return { error: "Say what is wrong in a few words.", workOrder: null };
  if (title.length > 200) return { error: "Keep the title under 200 characters.", workOrder: null };
  const priority = input.priority ?? "normal";
  if (!WO_PRIORITIES.includes(priority)) return { error: "Pick a valid priority.", workOrder: null };
  const source = input.source ?? "staff";
  if (!WO_SOURCES.includes(source)) return { error: "Unknown source.", workOrder: null };
  const tenantId = input.tenantId;

  if (input.externalRef) {
    const { data: found } = await service
      .schema("hotel")
      .from("maintenance_work_orders")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("source", source)
      .eq("external_ref", input.externalRef)
      .maybeSingle();
    if (found) return { error: null, workOrder: mapRow(found, await lookups(service, tenantId, [found])), existing: true };
  }

  // A room must belong to this hotel.
  let roomUnitId = input.roomUnitId ?? null;
  if (roomUnitId) {
    const { data: unit } = await service.schema("hotel").from("room_units").select("id").eq("tenant_id", tenantId).eq("id", roomUnitId).maybeSingle();
    if (!unit) return { error: "That room is not in this hotel.", workOrder: null };
  }
  // An asset in a room brings its room along.
  let locationText = input.locationText?.trim() || null;
  if (input.assetId) {
    const { data: asset } = await service
      .schema("hotel")
      .from("maintenance_assets")
      .select("id, room_unit_id, location_text")
      .eq("tenant_id", tenantId)
      .eq("id", input.assetId)
      .maybeSingle();
    if (!asset) return { error: "That piece of equipment is not in this hotel's register.", workOrder: null };
    if (!roomUnitId && asset.room_unit_id) roomUnitId = asset.room_unit_id as string;
    if (!locationText && !roomUnitId && asset.location_text) locationText = asset.location_text as string;
  }
  if (!roomUnitId && !locationText && !input.assetId) return { error: "Say which room or area it is in.", workOrder: null };
  if (input.technicianId) {
    const { data: tech } = await service.schema("hotel").from("maintenance_technicians").select("id, active").eq("tenant_id", tenantId).eq("id", input.technicianId).maybeSingle();
    if (!tech || !tech.active) return { error: "That technician is not available.", workOrder: null };
  }

  const settings = await getMaintenanceSettings(service, tenantId);
  const now = new Date();
  const { data: seq, error: seqError } = await service.schema("hotel").rpc("next_maintenance_number", { p_tenant: tenantId, p_kind: "work_order" });
  if (seqError || typeof seq !== "number") {
    return { error: seqError?.message ?? "Could not number the work order. Has the maintenance migration been run?", workOrder: null };
  }
  const woNumber = `MWO-${String(seq).padStart(4, "0")}`;

  const { data: row, error } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .insert({
      tenant_id: tenantId,
      wo_number: woNumber,
      title,
      description: input.description?.trim() || null,
      category: input.category?.trim() || null,
      priority,
      status: input.technicianId ? "assigned" : "open",
      source,
      room_unit_id: roomUnitId,
      location_text: locationText,
      asset_id: input.assetId ?? null,
      schedule_id: input.scheduleId ?? null,
      schedule_due_on: input.scheduleDueOn ?? null,
      technician_id: input.technicianId ?? null,
      assigned_at: input.technicianId ? now.toISOString() : null,
      reported_by_name: input.reportedByName ?? input.actor.name,
      reported_by_user: input.actor.userId,
      external_ref: input.externalRef ?? null,
      sla_due_at: slaDueAt(now, settings, priority).toISOString(),
      created_by: input.actor.userId,
    })
    .select("*")
    .single();
  if (error || !row) {
    // The schedule's unique index stops a second order for the same due date.
    if (error?.code === "23505" && input.scheduleId) return { error: null, workOrder: null, existing: true };
    return { error: error?.message ?? "Could not save the work order.", workOrder: null };
  }

  await addEvent(service, tenantId, row.id as string, "created", `Raised from ${source.replace("_", " ")}`, input.actor);
  await writeAuditLog({
    tenantId,
    actorUserId: input.actor.userId,
    action: "work_order_created",
    entityType: "maintenance_work_order",
    entityId: row.id as string,
    after: { woNumber, title, priority, source },
  });

  if (priority === "urgent") {
    await sendAlert({
      tenantId,
      type: "work_order_urgent",
      title: `Urgent fault: ${title}`,
      body: `${woNumber}${roomUnitId ? "" : locationText ? ` at ${locationText}` : ""}. Target: fixed within ${settings.slaUrgentHours} hours.`,
      severity: "critical",
      entityType: "maintenance_work_order",
      entityId: row.id as string,
      department: "maintenance",
    });
  }

  return { error: null, workOrder: mapRow(row, await lookups(service, tenantId, [row])) };
}

export type ListFilters = {
  status?: "open" | "all" | WoStatus;
  priority?: WoPriority;
  technicianId?: string;
  roomUnitId?: string;
  assetId?: string;
  search?: string;
  limit?: number;
};

export async function listWorkOrders(service: SupabaseClient, tenantId: string, f: ListFilters = {}): Promise<WorkOrder[]> {
  let q = service.schema("hotel").from("maintenance_work_orders").select("*").eq("tenant_id", tenantId);
  if (!f.status || f.status === "open") q = q.in("status", OPEN_STATUSES);
  else if (f.status !== "all") q = q.eq("status", f.status);
  if (f.priority) q = q.eq("priority", f.priority);
  if (f.technicianId) q = q.eq("technician_id", f.technicianId);
  if (f.roomUnitId) q = q.eq("room_unit_id", f.roomUnitId);
  if (f.assetId) q = q.eq("asset_id", f.assetId);
  if (f.search) {
    const s = f.search.replace(/[%,()]/g, " ").trim();
    if (s) q = q.or(`title.ilike.%${s}%,wo_number.ilike.%${s}%,location_text.ilike.%${s}%`);
  }
  q = q.order("created_at", { ascending: false }).limit(f.limit ?? 300);
  const { data } = await q;
  const rows = data ?? [];
  const l = await lookups(service, tenantId, rows);
  const list = rows.map((r) => mapRow(r, l));
  // Most urgent first, then oldest first within a priority.
  const weight: Record<WoPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  if (!f.status || f.status === "open") {
    list.sort((a, b) => {
      const ao = isOverdue(a) ? 0 : 1;
      const bo = isOverdue(b) ? 0 : 1;
      return ao - bo || weight[a.priority] - weight[b.priority] || a.createdAt.localeCompare(b.createdAt);
    });
  }
  return list;
}

export async function getWorkOrder(
  service: SupabaseClient,
  tenantId: string,
  id: string,
): Promise<{ workOrder: WorkOrder; events: WorkOrderEvent[]; parts: WorkOrderPart[] } | null> {
  const { data: row } = await service.schema("hotel").from("maintenance_work_orders").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!row) return null;
  const [l, events, parts] = await Promise.all([
    lookups(service, tenantId, [row]),
    service.schema("hotel").from("maintenance_work_order_events").select("*").eq("work_order_id", id).order("created_at", { ascending: true }),
    service.schema("hotel").from("maintenance_work_order_parts").select("*").eq("work_order_id", id).order("created_at", { ascending: true }),
  ]);
  return {
    workOrder: mapRow(row, l),
    events: (events.data ?? []).map((e: any) => ({ id: e.id, kind: e.kind, body: e.body ?? null, actorName: e.actor_name ?? null, createdAt: e.created_at })),
    parts: (parts.data ?? []).map((p: any) => ({
      id: p.id,
      itemId: p.item_id ?? null,
      description: p.description,
      qty: n(p.qty),
      unitCost: n(p.unit_cost),
      createdAt: p.created_at,
    })),
  };
}

async function loadRow(service: SupabaseClient, tenantId: string, id: string) {
  const { data } = await service.schema("hotel").from("maintenance_work_orders").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data as any | null;
}

export async function addComment(service: SupabaseClient, tenantId: string, id: string, text: string, actor: Actor) {
  const body = text.trim();
  if (!body) return { error: "Write a note first." };
  const row = await loadRow(service, tenantId, id);
  if (!row) return { error: "Work order not found." };
  await addEvent(service, tenantId, id, "comment", body, actor);
  return { error: null };
}

export async function assignTechnician(
  service: SupabaseClient,
  tenantId: string,
  id: string,
  technicianId: string | null,
  actor: Actor,
): Promise<{ error: string | null }> {
  const row = await loadRow(service, tenantId, id);
  if (!row) return { error: "Work order not found." };
  if (["completed", "cancelled"].includes(row.status)) return { error: "This order is closed. Reopen it first." };
  let techName: string | null = null;
  if (technicianId) {
    const { data: tech } = await service.schema("hotel").from("maintenance_technicians").select("name, active").eq("tenant_id", tenantId).eq("id", technicianId).maybeSingle();
    if (!tech || !tech.active) return { error: "That technician is not available." };
    techName = tech.name as string;
  }
  const status: WoStatus = technicianId ? (row.status === "open" ? "assigned" : row.status) : row.status === "assigned" ? "open" : row.status;
  const { error } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .update({ technician_id: technicianId, status, assigned_at: technicianId ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  await addEvent(service, tenantId, id, "assigned", technicianId ? `Assigned to ${techName}` : "Taken off the technician", actor);
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "work_order_assigned",
    entityType: "maintenance_work_order",
    entityId: id,
    before: { technicianId: row.technician_id },
    after: { technicianId },
  });
  return { error: null };
}

export async function changePriority(service: SupabaseClient, tenantId: string, id: string, priority: WoPriority, actor: Actor) {
  if (!WO_PRIORITIES.includes(priority)) return { error: "Pick a valid priority." };
  const row = await loadRow(service, tenantId, id);
  if (!row) return { error: "Work order not found." };
  if (row.priority === priority) return { error: null };
  const settings = await getMaintenanceSettings(service, tenantId);
  // The clock restarts from when the order was raised, at the new priority's target.
  const due = slaDueAt(new Date(row.created_at), settings, priority).toISOString();
  const { error } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .update({ priority, sla_due_at: due, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: error.message };
  await addEvent(service, tenantId, id, "priority", `Priority changed from ${row.priority} to ${priority}`, actor);
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "work_order_priority", entityType: "maintenance_work_order", entityId: id, before: { priority: row.priority }, after: { priority } });
  if (priority === "urgent") {
    await sendAlert({
      tenantId,
      type: "work_order_urgent",
      title: `Made urgent: ${row.title}`,
      body: `${row.wo_number} is now urgent.`,
      severity: "critical",
      entityType: "maintenance_work_order",
      entityId: id,
      department: "maintenance",
      dedupeHours: 1,
    });
  }
  return { error: null };
}

export async function changeStatus(
  service: SupabaseClient,
  tenantId: string,
  id: string,
  to: WoStatus,
  actor: Actor,
  opts?: { holdReason?: string; resolutionNotes?: string; labourMinutes?: number },
): Promise<{ error: string | null; roomReleased?: boolean }> {
  const row = await loadRow(service, tenantId, id);
  if (!row) return { error: "Work order not found." };
  const from = row.status as WoStatus;
  if (from === to) return { error: null };
  if (!canMove(from, to)) return { error: `A ${from.replace("_", " ")} order can't go straight to ${to.replace("_", " ")}.` };
  if (to === "on_hold" && !opts?.holdReason?.trim()) return { error: "Say why it is on hold (for example, waiting for a part)." };
  if (to === "completed" && !opts?.resolutionNotes?.trim()) return { error: "Say what was done to fix it." };
  if (to === "in_progress" && !row.technician_id) return { error: "Assign a technician before starting the work." };

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: to, updated_at: now };
  if (to === "in_progress" && !row.started_at) patch.started_at = now;
  if (to === "on_hold") patch.hold_reason = opts?.holdReason?.trim();
  if (from === "on_hold") patch.hold_reason = null;
  if (to === "completed") {
    patch.completed_at = now;
    patch.resolution_notes = opts?.resolutionNotes?.trim();
    if (opts?.labourMinutes !== undefined) {
      if (!Number.isFinite(opts.labourMinutes) || opts.labourMinutes < 0) return { error: "Labour time can't be negative." };
      patch.labour_minutes = Math.round(opts.labourMinutes);
    }
  }
  if (from === "completed" || from === "cancelled") {
    patch.completed_at = null;
    patch.status = row.technician_id ? "assigned" : "open";
  }
  const { error } = await service.schema("hotel").from("maintenance_work_orders").update(patch).eq("tenant_id", tenantId).eq("id", id);
  if (error) return { error: error.message };

  let roomReleased = false;
  if ((to === "completed" || to === "cancelled") && row.room_block_id) {
    const released = await releaseRoomForOrder(service, tenantId, id, actor);
    roomReleased = released.released;
  }

  const label = to.replace("_", " ");
  await addEvent(
    service,
    tenantId,
    id,
    "status",
    to === "on_hold" ? `On hold: ${opts?.holdReason?.trim()}` : to === "completed" ? `Completed: ${opts?.resolutionNotes?.trim()}` : `Marked ${label}`,
    actor,
  );
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: `work_order_${to}`,
    entityType: "maintenance_work_order",
    entityId: id,
    before: { status: from },
    after: { status: patch.status },
  });
  return { error: null, roomReleased };
}

export async function updateDetails(
  service: SupabaseClient,
  tenantId: string,
  id: string,
  patch: { title?: string; description?: string | null; category?: string | null; locationText?: string | null },
  actor: Actor,
) {
  const row = await loadRow(service, tenantId, id);
  if (!row) return { error: "Work order not found." };
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { error: "The title can't be empty." };
    update.title = patch.title.trim();
  }
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.category !== undefined) update.category = patch.category?.trim() || null;
  if (patch.locationText !== undefined) update.location_text = patch.locationText?.trim() || null;
  const { error } = await service.schema("hotel").from("maintenance_work_orders").update(update).eq("tenant_id", tenantId).eq("id", id);
  if (error) return { error: error.message };
  await addEvent(service, tenantId, id, "edited", "Details edited", actor);
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "work_order_edited", entityType: "maintenance_work_order", entityId: id, after: update });
  return { error: null };
}

/** Raises an alert for every open order past its target, once a day per order. Used by the daily job. */
export async function alertOverdueOrders(service: SupabaseClient, tenantId: string): Promise<number> {
  const { data } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .select("id, wo_number, title, priority, sla_due_at, status")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "assigned", "in_progress"])
    .lt("sla_due_at", new Date().toISOString());
  let count = 0;
  for (const r of (data ?? []) as any[]) {
    const res = await sendAlert({
      tenantId,
      type: "work_order_overdue",
      title: `Overdue: ${r.title}`,
      body: `${r.wo_number} (${r.priority}) has passed its target time and is still ${String(r.status).replace("_", " ")}.`,
      severity: r.priority === "urgent" || r.priority === "high" ? "critical" : "warning",
      entityType: "maintenance_work_order",
      entityId: r.id,
      department: "maintenance",
      dedupeHours: 24,
    });
    if (res.id) count++;
  }
  return count;
}
