import type { SupabaseClient } from "@supabase/supabase-js";

export type PosTerminalRow = { id: string; name: string; isActive: boolean };

function map(r: Record<string, unknown>): PosTerminalRow {
  return { id: r.id as string, name: r.name as string, isActive: Boolean(r.is_active) };
}

export async function listPosTerminals(
  service: SupabaseClient,
  tenantId: string,
  opts?: { activeOnly?: boolean },
): Promise<PosTerminalRow[]> {
  let q = service.schema("hotel").from("pos_terminals").select("id,name,is_active").eq("tenant_id", tenantId).order("name", { ascending: true });
  if (opts?.activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map(map);
}

export async function createPosTerminal(
  service: SupabaseClient,
  params: { tenantId: string; name: string },
): Promise<{ row: PosTerminalRow | null; error: string | null }> {
  const { data, error } = await service
    .schema("hotel")
    .from("pos_terminals")
    .insert({ tenant_id: params.tenantId, name: params.name.trim() })
    .select("id,name,is_active")
    .single();
  if (error || !data) {
    const dup = error?.code === "23505";
    return { row: null, error: dup ? "You already have a card machine with that name." : (error?.message ?? "Could not add the card machine.") };
  }
  return { row: map(data), error: null };
}

/**
 * Which machine a card payment was taken on. A payment recorded as "Card machine (POS)" must name one,
 * as long as the hotel has set any up; a hotel with none is not blocked, it just records no terminal.
 * Returns the terminal to save on the payment (or none), or an error to show the desk.
 */
export async function resolvePosTerminalForPayment(
  service: SupabaseClient,
  tenantId: string,
  method: string,
  terminalId: string | null | undefined,
): Promise<{ ok: true; terminal: { id: string; name: string } | null } | { ok: false; error: string }> {
  if (method !== "pos") return { ok: true, terminal: null };
  const active = await listPosTerminals(service, tenantId, { activeOnly: true });
  if (!terminalId) {
    if (active.length === 0) return { ok: true, terminal: null };
    return { ok: false, error: "Choose which card machine took this payment." };
  }
  const found = active.find((t) => t.id === terminalId);
  if (!found) return { ok: false, error: "That card machine isn't available. Pick one from the list." };
  return { ok: true, terminal: { id: found.id, name: found.name } };
}
