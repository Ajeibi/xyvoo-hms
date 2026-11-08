import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { createWorkOrder, type Actor } from "@/lib/hms/maintenance-orders";
import {
  WO_PRIORITIES,
  addInterval,
  type MaintenanceSchedule,
  type ScheduleUnit,
  type WoPriority,
} from "@/lib/hms/maintenance-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SYSTEM: Actor = { userId: null, name: "Planned maintenance" };
const UNITS: ScheduleUnit[] = ["day", "week", "month", "year"];

function map(r: any, rooms: Map<string, string>, assets: Map<string, string>, techs: Map<string, string>): MaintenanceSchedule {
  return {
    id: r.id,
    title: r.title,
    description: r.description ?? null,
    category: r.category ?? null,
    priority: r.priority,
    everyN: r.every_n,
    unit: r.unit,
    nextDue: r.next_due,
    leadDays: r.lead_days,
    assetId: r.asset_id ?? null,
    assetName: r.asset_id ? (assets.get(r.asset_id) ?? null) : null,
    roomUnitId: r.room_unit_id ?? null,
    roomCode: r.room_unit_id ? (rooms.get(r.room_unit_id) ?? null) : null,
    locationText: r.location_text ?? null,
    technicianId: r.technician_id ?? null,
    technicianName: r.technician_id ? (techs.get(r.technician_id) ?? null) : null,
    active: Boolean(r.active),
    lastGeneratedOn: r.last_generated_on ?? null,
  };
}

export async function listSchedules(service: SupabaseClient, tenantId: string): Promise<MaintenanceSchedule[]> {
  const { data } = await service.schema("hotel").from("maintenance_schedules").select("*").eq("tenant_id", tenantId).order("next_due");
  const rows = data ?? [];
  const ids = (k: string) => [...new Set(rows.map((r: any) => r[k]).filter(Boolean))] as string[];
  const [rooms, assets, techs] = await Promise.all([
    ids("room_unit_id").length ? service.schema("hotel").from("room_units").select("id, room_code").in("id", ids("room_unit_id")) : Promise.resolve({ data: [] as any[] }),
    ids("asset_id").length ? service.schema("hotel").from("maintenance_assets").select("id, name").in("id", ids("asset_id")) : Promise.resolve({ data: [] as any[] }),
    ids("technician_id").length ? service.schema("hotel").from("maintenance_technicians").select("id, name").in("id", ids("technician_id")) : Promise.resolve({ data: [] as any[] }),
  ]);
  return rows.map((r: any) =>
    map(
      r,
      new Map((rooms.data ?? []).map((x: any) => [x.id as string, x.room_code as string])),
      new Map((assets.data ?? []).map((x: any) => [x.id as string, x.name as string])),
      new Map((techs.data ?? []).map((x: any) => [x.id as string, x.name as string])),
    ),
  );
}

export type ScheduleInput = {
  title: string;
  description?: string | null;
  category?: string | null;
  priority?: WoPriority;
  everyN: number;
  unit: ScheduleUnit;
  nextDue: string;
  leadDays?: number;
  assetId?: string | null;
  roomUnitId?: string | null;
  locationText?: string | null;
  technicianId?: string | null;
  active?: boolean;
};

export async function saveSchedule(
  service: SupabaseClient,
  tenantId: string,
  actor: Actor,
  input: ScheduleInput,
  id?: string,
): Promise<{ error: string | null }> {
  const title = input.title.trim();
  if (!title) return { error: "Say what the job is, for example 'Service the lift'." };
  if (!Number.isInteger(input.everyN) || input.everyN < 1 || input.everyN > 520) return { error: "How often must be a whole number from 1." };
  if (!UNITS.includes(input.unit)) return { error: "Pick days, weeks, months or years." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.nextDue)) return { error: "Pick the next due date." };
  const priority = input.priority ?? "normal";
  if (!WO_PRIORITIES.includes(priority)) return { error: "Pick a priority." };
  const lead = input.leadDays ?? 3;
  if (!Number.isInteger(lead) || lead < 0 || lead > 90) return { error: "Lead time must be 0 to 90 days." };
  if (!input.assetId && !input.roomUnitId && !input.locationText?.trim()) return { error: "Say which equipment, room or area it covers." };

  const row = {
    title,
    description: input.description?.trim() || null,
    category: input.category?.trim() || null,
    priority,
    every_n: input.everyN,
    unit: input.unit,
    next_due: input.nextDue,
    lead_days: lead,
    asset_id: input.assetId || null,
    room_unit_id: input.roomUnitId || null,
    location_text: input.locationText?.trim() || null,
    technician_id: input.technicianId || null,
    active: input.active ?? true,
    updated_at: new Date().toISOString(),
  };
  const db = service.schema("hotel").from("maintenance_schedules");
  const { error } = id ? await db.update(row).eq("tenant_id", tenantId).eq("id", id) : await db.insert({ tenant_id: tenantId, created_by: actor.userId, ...row });
  if (error) return { error: error.message };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: id ? "maintenance_schedule_updated" : "maintenance_schedule_created", entityType: "maintenance_schedule", entityId: id ?? null, after: row });
  return { error: null };
}

/**
 * Makes the work orders that are due. A schedule makes its order `lead_days` before the due date,
 * then moves its next due date on by one interval. A schedule that was missed for a long time
 * only makes an order for its latest missed date (older missed dates are skipped, not piled up).
 * Safe to run twice: the database allows one order per schedule per due date.
 */
export async function generateDueSchedules(service: SupabaseClient, tenantId: string, today = new Date().toISOString().slice(0, 10)): Promise<number> {
  const { data } = await service.schema("hotel").from("maintenance_schedules").select("*").eq("tenant_id", tenantId).eq("active", true);
  let made = 0;
  for (const s of (data ?? []) as any[]) {
    let guard = 0;
    let due: string = s.next_due;
    // Skip dates missed by more than a whole interval; only the latest missed one gets an order.
    while (guard++ < 1000 && addInterval(due, s.every_n, s.unit) <= today) due = addInterval(due, s.every_n, s.unit);
    guard = 0;
    while (guard++ < 12) {
      const trigger = new Date(`${due}T00:00:00Z`);
      trigger.setUTCDate(trigger.getUTCDate() - (s.lead_days as number));
      if (trigger.toISOString().slice(0, 10) > today) break;
      const res = await createWorkOrder(service, {
        tenantId,
        title: s.title,
        description: [s.description, `Planned job due ${due}.`].filter(Boolean).join("\n"),
        category: s.category,
        priority: s.priority,
        source: "planned",
        roomUnitId: s.room_unit_id,
        locationText: s.location_text,
        assetId: s.asset_id,
        technicianId: s.technician_id,
        scheduleId: s.id,
        scheduleDueOn: due,
        actor: SYSTEM,
      });
      if (res.error) break;
      if (res.workOrder) made++;
      due = addInterval(due, s.every_n, s.unit);
    }
    if (due !== s.next_due) {
      await service.schema("hotel").from("maintenance_schedules").update({ next_due: due, last_generated_on: today, updated_at: new Date().toISOString() }).eq("id", s.id);
    }
  }
  return made;
}
