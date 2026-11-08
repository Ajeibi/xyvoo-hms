import type { SupabaseClient } from "@supabase/supabase-js";
import { listAssets } from "@/lib/hms/maintenance-assets";
import { listBlockedRoomsWithoutOrder, type BlockedRoomWithoutOrder } from "@/lib/hms/maintenance-rooms";
import { listCategories, listTechnicians, getMaintenanceSettings } from "@/lib/hms/maintenance-settings";
import { listSchedules } from "@/lib/hms/maintenance-schedules";
import { OPEN_STATUSES, isOverdue, type CategoryRow, type MaintenanceSchedule, type Technician, type WorkOrder } from "@/lib/hms/maintenance-shared";
import { listWorkOrders } from "@/lib/hms/maintenance-orders";
import { listRoomUnitsForTenant } from "@/lib/hms/data";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

/** The pick-lists every Maintenance form needs. */
export async function loadChoices(service: SupabaseClient, tenantId: string) {
  const [rooms, categories, technicians, settings] = await Promise.all([
    listRoomUnitsForTenant(tenantId),
    listCategories(service, tenantId, { activeOnly: true }),
    listTechnicians(service, tenantId),
    getMaintenanceSettings(service, tenantId),
  ]);
  const assets = await listAssets(service, tenantId, { repeatThreshold: settings.repeatFaultThreshold });
  return {
    rooms: rooms.map((r) => ({ id: r.id, code: r.room_code })),
    assets: assets
      .filter((a) => a.status !== "retired")
      .map((a) => ({ id: a.id, label: `${a.assetTag} · ${a.name}${a.roomCode ? ` (Room ${a.roomCode})` : a.locationText ? ` (${a.locationText})` : ""}`, roomUnitId: a.roomUnitId })),
    categories: categories as CategoryRow[],
    technicians: technicians as Technician[],
    settings,
  };
}

export type DashboardData = {
  open: number;
  overdue: number;
  urgent: number;
  unassigned: number;
  onHold: number;
  roomsOutOfOrder: number;
  completedThisWeek: number;
  avgFixHours: number | null;
  slaKeptPercent: number | null;
  attention: WorkOrder[];
  blockedWithoutOrder: BlockedRoomWithoutOrder[];
  dueSoon: MaintenanceSchedule[];
  overdueSchedules: MaintenanceSchedule[];
  workload: { technicianId: string; name: string; open: number }[];
};

export async function loadDashboard(service: SupabaseClient, tenantId: string): Promise<DashboardData> {
  const [openOrders, blocked, schedules, techs] = await Promise.all([
    listWorkOrders(service, tenantId, { status: "open" }),
    listBlockedRoomsWithoutOrder(service, tenantId),
    listSchedules(service, tenantId),
    listTechnicians(service, tenantId, { activeOnly: true }),
  ]);
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const since7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const { data: done } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .select("created_at, completed_at, sla_due_at")
    .eq("tenant_id", tenantId)
    .eq("status", "completed")
    .gte("completed_at", since30);
  const finished = (done ?? []) as any[];
  const hours = finished.map((o) => (new Date(o.completed_at).getTime() - new Date(o.created_at).getTime()) / 3600000);
  const withSla = finished.filter((o) => o.sla_due_at);
  const kept = withSla.filter((o) => new Date(o.completed_at).getTime() <= new Date(o.sla_due_at).getTime()).length;

  const today = new Date().toISOString().slice(0, 10);
  const inWeek = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const active = schedules.filter((s) => s.active);

  return {
    open: openOrders.length,
    overdue: openOrders.filter((o) => isOverdue(o)).length,
    urgent: openOrders.filter((o) => o.priority === "urgent").length,
    unassigned: openOrders.filter((o) => !o.technicianId && o.status !== "on_hold").length,
    onHold: openOrders.filter((o) => o.status === "on_hold").length,
    roomsOutOfOrder: new Set(openOrders.filter((o) => o.roomBlockId && o.roomUnitId).map((o) => o.roomUnitId)).size + blocked.length,
    completedThisWeek: finished.filter((o) => o.completed_at >= since7).length,
    avgFixHours: hours.length ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10 : null,
    slaKeptPercent: withSla.length ? Math.round((kept / withSla.length) * 100) : null,
    attention: openOrders.filter((o) => isOverdue(o) || o.priority === "urgent" || !o.technicianId).slice(0, 8),
    blockedWithoutOrder: blocked,
    dueSoon: active.filter((s) => s.nextDue >= today && s.nextDue <= inWeek),
    overdueSchedules: active.filter((s) => s.nextDue < today),
    workload: techs.map((t) => ({ technicianId: t.id, name: t.name, open: openOrders.filter((o) => o.technicianId === t.id).length })),
  };
}

export type ReportRow = { label: string; orders: number; avgHours: number | null; partsCost: number; labourMinutes: number };
export type ReportData = {
  from: string;
  to: string;
  total: number;
  completed: number;
  slaKeptPercent: number | null;
  avgFixHours: number | null;
  partsCost: number;
  labourMinutes: number;
  bySource: { label: string; orders: number }[];
  byCategory: ReportRow[];
  byRoom: ReportRow[];
  byAsset: ReportRow[];
  byTechnician: ReportRow[];
  repeatRooms: { label: string; orders: number }[];
};

export async function loadReport(service: SupabaseClient, tenantId: string, from: string, to: string): Promise<ReportData> {
  const settings = await getMaintenanceSettings(service, tenantId);
  const { data } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .select("category, status, source, room_unit_id, asset_id, technician_id, created_at, completed_at, sla_due_at, parts_cost, labour_minutes")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .gte("created_at", `${from}T00:00:00Z`)
    .lte("created_at", `${to}T23:59:59Z`)
    .limit(10000);
  const rows = (data ?? []) as any[];

  const ids = (k: string) => [...new Set(rows.map((r) => r[k]).filter(Boolean))] as string[];
  const [rooms, assets, techs] = await Promise.all([
    ids("room_unit_id").length ? service.schema("hotel").from("room_units").select("id, room_code").eq("tenant_id", tenantId).in("id", ids("room_unit_id")) : Promise.resolve({ data: [] as any[] }),
    ids("asset_id").length ? service.schema("hotel").from("maintenance_assets").select("id, name, asset_tag").eq("tenant_id", tenantId).in("id", ids("asset_id")) : Promise.resolve({ data: [] as any[] }),
    ids("technician_id").length ? service.schema("hotel").from("maintenance_technicians").select("id, name").eq("tenant_id", tenantId).in("id", ids("technician_id")) : Promise.resolve({ data: [] as any[] }),
  ]);
  const roomName = new Map((rooms.data ?? []).map((r: any) => [r.id as string, `Room ${r.room_code}`]));
  const assetName = new Map((assets.data ?? []).map((r: any) => [r.id as string, `${r.asset_tag} · ${r.name}`]));
  const techName = new Map((techs.data ?? []).map((r: any) => [r.id as string, r.name as string]));

  const group = (keyOf: (r: any) => string | null): ReportRow[] => {
    const map = new Map<string, any[]>();
    for (const r of rows) {
      const k = keyOf(r);
      if (!k) continue;
      map.set(k, [...(map.get(k) ?? []), r]);
    }
    return [...map.entries()]
      .map(([label, list]) => {
        const fin = list.filter((r) => r.completed_at);
        const h = fin.map((r) => (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 3600000);
        return {
          label,
          orders: list.length,
          avgHours: h.length ? Math.round((h.reduce((s, x) => s + x, 0) / h.length) * 10) / 10 : null,
          partsCost: list.reduce((s, r) => s + num(r.parts_cost), 0),
          labourMinutes: list.reduce((s, r) => s + num(r.labour_minutes), 0),
        };
      })
      .sort((a, b) => b.orders - a.orders);
  };

  const done = rows.filter((r) => r.status === "completed" && r.completed_at);
  const hours = done.map((r) => (new Date(r.completed_at).getTime() - new Date(r.created_at).getTime()) / 3600000);
  const withSla = done.filter((r) => r.sla_due_at);
  const kept = withSla.filter((r) => new Date(r.completed_at).getTime() <= new Date(r.sla_due_at).getTime()).length;
  const byRoom = group((r) => (r.room_unit_id ? (roomName.get(r.room_unit_id) ?? "Room") : null));
  const sources = new Map<string, number>();
  for (const r of rows) sources.set(r.source, (sources.get(r.source) ?? 0) + 1);

  return {
    from,
    to,
    total: rows.length,
    completed: done.length,
    slaKeptPercent: withSla.length ? Math.round((kept / withSla.length) * 100) : null,
    avgFixHours: hours.length ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10 : null,
    partsCost: rows.reduce((s, r) => s + num(r.parts_cost), 0),
    labourMinutes: rows.reduce((s, r) => s + num(r.labour_minutes), 0),
    bySource: [...sources.entries()].map(([label, orders]) => ({ label, orders })).sort((a, b) => b.orders - a.orders),
    byCategory: group((r) => r.category ?? "No category"),
    byRoom: byRoom.slice(0, 15),
    byAsset: group((r) => (r.asset_id ? (assetName.get(r.asset_id) ?? "Equipment") : null)).slice(0, 15),
    byTechnician: group((r) => (r.technician_id ? (techName.get(r.technician_id) ?? "Technician") : "Unassigned")),
    repeatRooms: byRoom.filter((r) => r.orders >= settings.repeatFaultThreshold).map((r) => ({ label: r.label, orders: r.orders })),
  };
}

export { OPEN_STATUSES };
