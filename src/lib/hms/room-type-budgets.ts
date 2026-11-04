import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths } from "@/lib/hms/accounting-periods";

/*
 * Room revenue budgets per room type, by month. Departments (rooms, food and beverage, other) are
 * budgeted through Accounts; this adds the split of the rooms budget across the hotel's room types.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export type RoomTypeOption = { id: string; name: string };

/** The hotel's room types from its room setup. */
export async function loadRoomTypes(service: SupabaseClient, tenantId: string): Promise<RoomTypeOption[]> {
  const { data } = await service.from("tenants").select("room_types").eq("id", tenantId).maybeSingle();
  const raw = Array.isArray(data?.room_types) ? (data.room_types as { id?: unknown; name?: unknown }[]) : [];
  return raw.flatMap((t) => (typeof t?.id === "string" && typeof t?.name === "string" && t.id && t.name ? [{ id: t.id, name: t.name }] : []));
}

/** Monthly budget per room type over a span of months: roomTypeId → (first of month → amount). */
export async function loadRoomTypeBudgets(service: SupabaseClient, tenantId: string, fromMonth: string, toMonth: string): Promise<Map<string, Map<string, number>>> {
  const out = new Map<string, Map<string, number>>();
  const { data, error } = await service
    .schema("hotel")
    .from("room_type_budgets")
    .select("room_type_id,period_month,amount")
    .eq("tenant_id", tenantId)
    .gte("period_month", fromMonth)
    .lte("period_month", toMonth)
    .limit(5000);
  if (error) throw new Error(error.message);
  for (const r of data ?? []) {
    const id = r.room_type_id as string;
    const m = out.get(id) ?? new Map<string, number>();
    m.set(r.period_month as string, (m.get(r.period_month as string) ?? 0) + Number(r.amount));
    out.set(id, m);
  }
  return out;
}

export type RoomTypeBudgetRow = { roomTypeId: string; name: string; months: number[] };

/** Every room type with its twelve monthly budgets for `year` (0 where none). */
export async function getRoomTypeBudgetGrid(service: SupabaseClient, tenantId: string, year: number): Promise<RoomTypeBudgetRow[]> {
  const [types, budgets] = await Promise.all([loadRoomTypes(service, tenantId), loadRoomTypeBudgets(service, tenantId, `${year}-01-01`, `${year}-12-01`)]);
  return types.map((t) => {
    const months = Array.from({ length: 12 }, (_, i) => budgets.get(t.id)?.get(`${year}-${String(i + 1).padStart(2, "0")}-01`) ?? 0);
    return { roomTypeId: t.id, name: t.name, months };
  });
}

export type RoomTypeBudgetEntry = { roomTypeId: string; month: string; amount: number };

export async function saveRoomTypeBudgets(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; entries: RoomTypeBudgetEntry[] },
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  if (params.entries.length === 0) return { ok: true, saved: 0 };
  const known = new Set((await loadRoomTypes(service, params.tenantId)).map((t) => t.id));
  for (const e of params.entries) {
    if (!known.has(e.roomTypeId)) return { ok: false, error: "One of the room types was not found." };
    if (!(e.amount >= 0)) return { ok: false, error: "A budget cannot be negative." };
  }
  const keep = params.entries.filter((e) => e.amount > 0);
  if (keep.length > 0) {
    const { error } = await service
      .schema("hotel")
      .from("room_type_budgets")
      .upsert(
        keep.map((e) => ({ tenant_id: params.tenantId, room_type_id: e.roomTypeId, period_month: e.month, amount: round2(e.amount), updated_by: params.actorUserId, updated_at: new Date().toISOString() })),
        { onConflict: "tenant_id,room_type_id,period_month" },
      );
    if (error) return { ok: false, error: error.message };
  }
  for (const e of params.entries.filter((x) => x.amount === 0)) {
    await service.schema("hotel").from("room_type_budgets").delete().eq("tenant_id", params.tenantId).eq("room_type_id", e.roomTypeId).eq("period_month", e.month);
  }
  return { ok: true, saved: params.entries.length };
}

export function roomTypeMonths(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(`${year}-01-01`, i));
}
