import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import {
  DEFAULT_CATEGORIES,
  DEFAULT_SETTINGS,
  WO_PRIORITIES,
  type CategoryRow,
  type MaintenanceSettings,
  type Technician,
  type WoPriority,
} from "@/lib/hms/maintenance-shared";

const num = (v: unknown, fallback: number) => {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
};

export async function getMaintenanceSettings(service: SupabaseClient, tenantId: string): Promise<MaintenanceSettings> {
  const { data } = await service.schema("hotel").from("maintenance_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  return {
    slaUrgentHours: num(data.sla_urgent_hours, DEFAULT_SETTINGS.slaUrgentHours),
    slaHighHours: num(data.sla_high_hours, DEFAULT_SETTINGS.slaHighHours),
    slaNormalHours: num(data.sla_normal_hours, DEFAULT_SETTINGS.slaNormalHours),
    slaLowHours: num(data.sla_low_hours, DEFAULT_SETTINGS.slaLowHours),
    repeatFaultThreshold: num(data.repeat_fault_threshold, DEFAULT_SETTINGS.repeatFaultThreshold),
  };
}

export async function saveMaintenanceSettings(
  service: SupabaseClient,
  tenantId: string,
  actorUserId: string | null,
  next: MaintenanceSettings,
): Promise<{ error: string | null }> {
  const hours = [next.slaUrgentHours, next.slaHighHours, next.slaNormalHours, next.slaLowHours];
  if (hours.some((h) => !Number.isFinite(h) || h <= 0)) return { error: "Response times must be more than zero hours." };
  if (!(next.slaUrgentHours <= next.slaHighHours && next.slaHighHours <= next.slaNormalHours && next.slaNormalHours <= next.slaLowHours)) {
    return { error: "Urgent should be the quickest, then high, normal and low." };
  }
  if (!Number.isInteger(next.repeatFaultThreshold) || next.repeatFaultThreshold < 2) {
    return { error: "A repeat fault needs at least 2 orders." };
  }
  const before = await getMaintenanceSettings(service, tenantId);
  const { error } = await service
    .schema("hotel")
    .from("maintenance_settings")
    .upsert({
      tenant_id: tenantId,
      sla_urgent_hours: next.slaUrgentHours,
      sla_high_hours: next.slaHighHours,
      sla_normal_hours: next.slaNormalHours,
      sla_low_hours: next.slaLowHours,
      repeat_fault_threshold: next.repeatFaultThreshold,
      updated_at: new Date().toISOString(),
    });
  if (error) return { error: error.message };
  await writeAuditLog({
    tenantId,
    actorUserId,
    action: "maintenance_settings_changed",
    entityType: "maintenance_settings",
    before: before as unknown as Record<string, unknown>,
    after: next as unknown as Record<string, unknown>,
  });
  return { error: null };
}

/** The hotel's own categories, or the built-in list until it has set any up. */
export async function listCategories(service: SupabaseClient, tenantId: string, opts?: { activeOnly?: boolean }): Promise<CategoryRow[]> {
  let q = service.schema("hotel").from("maintenance_categories").select("*").eq("tenant_id", tenantId).order("name");
  if (opts?.activeOnly) q = q.eq("active", true);
  const { data } = await q;
  const rows = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    defaultPriority: r.default_priority as WoPriority,
    active: Boolean(r.active),
  }));
  if (rows.length > 0) return rows;
  const { count } = await service.schema("hotel").from("maintenance_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if ((count ?? 0) > 0) return rows; // all switched off on purpose
  return DEFAULT_CATEGORIES.map((c) => ({ id: `default:${c.name}`, name: c.name, defaultPriority: c.priority, active: true }));
}

export async function saveCategory(
  service: SupabaseClient,
  tenantId: string,
  actorUserId: string | null,
  input: { id?: string; name: string; defaultPriority: WoPriority; active: boolean },
): Promise<{ error: string | null }> {
  const name = input.name.trim();
  if (!name) return { error: "Give the category a name." };
  if (!WO_PRIORITIES.includes(input.defaultPriority)) return { error: "Pick a priority." };
  const db = service.schema("hotel").from("maintenance_categories");

  // The first time a hotel edits anything, copy the built-in list in so nothing disappears.
  const { count } = await service.schema("hotel").from("maintenance_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  if ((count ?? 0) === 0) {
    await service
      .schema("hotel")
      .from("maintenance_categories")
      .insert(DEFAULT_CATEGORIES.map((c) => ({ tenant_id: tenantId, name: c.name, default_priority: c.priority })));
  }

  const row = { name, default_priority: input.defaultPriority, active: input.active };
  const realId = input.id && !input.id.startsWith("default:") ? input.id : null;
  const defaultName = input.id?.startsWith("default:") ? input.id.slice(8) : null;
  let error;
  if (realId) ({ error } = await db.update(row).eq("tenant_id", tenantId).eq("id", realId));
  else if (defaultName) ({ error } = await db.update(row).eq("tenant_id", tenantId).eq("name", defaultName));
  else ({ error } = await db.insert({ tenant_id: tenantId, ...row }));
  if (error) return { error: error.code === "23505" ? "There is already a category with that name." : error.message };
  await writeAuditLog({ tenantId, actorUserId, action: "maintenance_category_saved", entityType: "maintenance_category", after: row });
  return { error: null };
}

export async function listTechnicians(service: SupabaseClient, tenantId: string, opts?: { activeOnly?: boolean }): Promise<Technician[]> {
  let q = service.schema("hotel").from("maintenance_technicians").select("*").eq("tenant_id", tenantId).order("name");
  if (opts?.activeOnly) q = q.eq("active", true);
  const { data } = await q;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    phone: (r.phone as string | null) ?? null,
    specialty: (r.specialty as string | null) ?? null,
    active: Boolean(r.active),
  }));
}

export async function saveTechnician(
  service: SupabaseClient,
  tenantId: string,
  actorUserId: string | null,
  input: { id?: string; name: string; phone?: string | null; specialty?: string | null; active: boolean },
): Promise<{ error: string | null }> {
  const name = input.name.trim();
  if (!name) return { error: "Give the technician a name." };
  const row = { name, phone: input.phone?.trim() || null, specialty: input.specialty?.trim() || null, active: input.active };
  const db = service.schema("hotel").from("maintenance_technicians");
  const { error } = input.id
    ? await db.update(row).eq("tenant_id", tenantId).eq("id", input.id)
    : await db.insert({ tenant_id: tenantId, ...row });
  if (error) return { error: error.message };
  await writeAuditLog({ tenantId, actorUserId, action: "maintenance_technician_saved", entityType: "maintenance_technician", entityId: input.id ?? null, after: row });
  return { error: null };
}
