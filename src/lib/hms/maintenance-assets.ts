import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import type { Actor } from "@/lib/hms/maintenance-orders";
import type { AssetStatus, MaintenanceAsset } from "@/lib/hms/maintenance-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

export type AssetWithStats = MaintenanceAsset & {
  orderCount: number;
  openOrders: number;
  ordersLast12Months: number;
  totalPartsCost: number;
  totalLabourMinutes: number;
  lastServiced: string | null;
  underWarranty: boolean;
  repeatFault: boolean;
};

function mapAsset(r: any, rooms: Map<string, string>): MaintenanceAsset {
  return {
    id: r.id,
    assetTag: r.asset_tag,
    name: r.name,
    category: r.category ?? null,
    roomUnitId: r.room_unit_id ?? null,
    roomCode: r.room_unit_id ? (rooms.get(r.room_unit_id) ?? null) : null,
    locationText: r.location_text ?? null,
    make: r.make ?? null,
    model: r.model ?? null,
    serialNumber: r.serial_number ?? null,
    installedOn: r.installed_on ?? null,
    warrantyUntil: r.warranty_until ?? null,
    fixedAssetId: r.fixed_asset_id ?? null,
    status: r.status,
    notes: r.notes ?? null,
  };
}

async function roomCodes(service: SupabaseClient, tenantId: string, rows: any[]) {
  const ids = [...new Set(rows.map((r) => r.room_unit_id).filter(Boolean))] as string[];
  if (!ids.length) return new Map<string, string>();
  const { data } = await service.schema("hotel").from("room_units").select("id, room_code").eq("tenant_id", tenantId).in("id", ids);
  return new Map((data ?? []).map((r: any) => [r.id as string, r.room_code as string]));
}

export async function listAssets(
  service: SupabaseClient,
  tenantId: string,
  opts: { repeatThreshold: number; includeRetired?: boolean },
): Promise<AssetWithStats[]> {
  let q = service.schema("hotel").from("maintenance_assets").select("*").eq("tenant_id", tenantId).order("name");
  if (!opts.includeRetired) q = q.neq("status", "retired");
  const { data } = await q;
  const rows = data ?? [];
  if (!rows.length) return [];
  const rooms = await roomCodes(service, tenantId, rows);
  const { data: orders } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .select("asset_id, status, parts_cost, labour_minutes, created_at, completed_at")
    .eq("tenant_id", tenantId)
    .in("asset_id", rows.map((r: any) => r.id))
    .neq("status", "cancelled");
  const yearAgo = Date.now() - 365 * 86400000;
  const today = new Date().toISOString().slice(0, 10);
  return rows.map((r: any) => {
    const mine = (orders ?? []).filter((o: any) => o.asset_id === r.id);
    const recent = mine.filter((o: any) => new Date(o.created_at).getTime() >= yearAgo).length;
    const done = mine.map((o: any) => o.completed_at as string | null).filter(Boolean).sort() as string[];
    return {
      ...mapAsset(r, rooms),
      orderCount: mine.length,
      openOrders: mine.filter((o: any) => ["open", "assigned", "in_progress", "on_hold"].includes(o.status)).length,
      ordersLast12Months: recent,
      totalPartsCost: mine.reduce((s: number, o: any) => s + num(o.parts_cost), 0),
      totalLabourMinutes: mine.reduce((s: number, o: any) => s + num(o.labour_minutes), 0),
      lastServiced: done.length ? done[done.length - 1] : null,
      underWarranty: Boolean(r.warranty_until && r.warranty_until >= today),
      repeatFault: recent >= opts.repeatThreshold,
    };
  });
}

export async function getAsset(service: SupabaseClient, tenantId: string, id: string): Promise<MaintenanceAsset | null> {
  const { data } = await service.schema("hotel").from("maintenance_assets").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!data) return null;
  return mapAsset(data, await roomCodes(service, tenantId, [data]));
}

export type AssetInput = {
  name: string;
  assetTag?: string | null;
  category?: string | null;
  roomUnitId?: string | null;
  locationText?: string | null;
  make?: string | null;
  model?: string | null;
  serialNumber?: string | null;
  installedOn?: string | null;
  warrantyUntil?: string | null;
  fixedAssetId?: string | null;
  status?: AssetStatus;
  notes?: string | null;
};

const isDate = (v: string | null | undefined) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function saveAsset(
  service: SupabaseClient,
  tenantId: string,
  actor: Actor,
  input: AssetInput,
  id?: string,
): Promise<{ error: string | null; id?: string }> {
  const name = input.name.trim();
  if (!name) return { error: "Give the equipment a name." };
  if (!isDate(input.installedOn) || !isDate(input.warrantyUntil)) return { error: "Dates must look like 2026-11-30." };
  if (input.roomUnitId) {
    const { data: unit } = await service.schema("hotel").from("room_units").select("id").eq("tenant_id", tenantId).eq("id", input.roomUnitId).maybeSingle();
    if (!unit) return { error: "That room is not in this hotel." };
  }
  if (input.fixedAssetId) {
    const { data: fa } = await service.schema("hotel").from("fixed_assets").select("id").eq("tenant_id", tenantId).eq("id", input.fixedAssetId).maybeSingle();
    if (!fa) return { error: "That fixed asset was not found." };
  }

  const row: Record<string, unknown> = {
    name,
    category: input.category?.trim() || null,
    room_unit_id: input.roomUnitId || null,
    location_text: input.locationText?.trim() || null,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    serial_number: input.serialNumber?.trim() || null,
    installed_on: input.installedOn || null,
    warranty_until: input.warrantyUntil || null,
    fixed_asset_id: input.fixedAssetId || null,
    status: input.status ?? "in_service",
    notes: input.notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    if (input.assetTag?.trim()) row.asset_tag = input.assetTag.trim();
    const { error } = await service.schema("hotel").from("maintenance_assets").update(row).eq("tenant_id", tenantId).eq("id", id);
    if (error) return { error: error.code === "23505" ? "That asset tag is already used." : error.message };
    await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "maintenance_asset_updated", entityType: "maintenance_asset", entityId: id, after: row });
    return { error: null, id };
  }

  let tag = input.assetTag?.trim();
  if (!tag) {
    const { data: seq, error: seqError } = await service.schema("hotel").rpc("next_maintenance_number", { p_tenant: tenantId, p_kind: "asset" });
    if (seqError || typeof seq !== "number") return { error: seqError?.message ?? "Could not number the equipment." };
    tag = `AST-${String(seq).padStart(4, "0")}`;
  }
  const { data, error } = await service
    .schema("hotel")
    .from("maintenance_assets")
    .insert({ tenant_id: tenantId, asset_tag: tag, created_by: actor.userId, ...row })
    .select("id")
    .single();
  if (error || !data) return { error: error?.code === "23505" ? "That asset tag is already used." : (error?.message ?? "Could not save.") };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "maintenance_asset_created", entityType: "maintenance_asset", entityId: data.id as string, after: { ...row, asset_tag: tag } });
  return { error: null, id: data.id as string };
}

/** Fixed assets (Accounts) that could be linked to a piece of equipment. */
export async function listFixedAssetChoices(service: SupabaseClient, tenantId: string) {
  const { data } = await service.schema("hotel").from("fixed_assets").select("id, asset_code, name").eq("tenant_id", tenantId).eq("status", "active").order("name");
  return (data ?? []).map((r: any) => ({ id: r.id as string, label: `${r.asset_code} · ${r.name}` }));
}
