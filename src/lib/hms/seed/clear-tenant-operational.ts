import type { SupabaseClient } from "@supabase/supabase-js";

/** Remove kitchen / POS tickets only — keeps menu, tables, outlets. */
export async function clearTenantFbOrders(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const h = () => supabase.schema("hotel");

  const { error: itemsError } = await h().from("fb_order_items").delete().eq("tenant_id", tenantId);
  if (itemsError) return { ok: false, error: `fb_order_items: ${itemsError.message}` };

  const { error: ordersError } = await h().from("fb_orders").delete().eq("tenant_id", tenantId);
  if (ordersError) return { ok: false, error: `fb_orders: ${ordersError.message}` };

  const { error: tablesError } = await h()
    .from("fb_tables")
    .update({ status: "available" })
    .eq("tenant_id", tenantId)
    .neq("status", "available");
  if (tablesError && !tablesError.message.includes("does not exist")) {
    return { ok: false, error: `fb_tables: ${tablesError.message}` };
  }

  return { ok: true };
}

/**
 * Dev-only: clear guest/stay ledger + room operational state for one tenant.
 * F&B: orders only — menu, tables, outlets, and kitchen settings are kept.
 */
export async function clearTenantOperationalData(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const h = () => supabase.schema("hotel");

  const ordersResult = await clearTenantFbOrders(supabase, tenantId);
  if (!ordersResult.ok) return ordersResult;

  const { data: resRows, error: resSelectError } = await h()
    .from("reservations")
    .select("id")
    .eq("tenant_id", tenantId);
  if (resSelectError) {
    return { ok: false, error: `reservations select: ${resSelectError.message}` };
  }
  const reservationIds = (resRows ?? []).map((r) => r.id as string);

  const del = async (table: string) => {
    const { error } = await h().from(table).delete().eq("tenant_id", tenantId);
    if (error) return error.message;
    return null;
  };

  for (const table of [
    "payment_intents",
    "guest_request_events",
    "guest_request_notes",
    "guest_requests",
    "folio_transactions",
    "reservations",
    "guests",
    "group_bookings",
    "cash_float_sessions",
    "housekeeping_tasks",
    "room_blocks",
    "room_key_events",
    "room_incidents",
    "room_unit_notes",
    "notifications",
    "audit_logs",
    "shift_notes",
  ] as const) {
    const err = await del(table);
    if (err) {
      if (err.includes("does not exist") || err.includes("Could not find the table")) {
        continue;
      }
      return { ok: false, error: `${table}: ${err}` };
    }
  }

  if (reservationIds.length) {
    const { error } = await h().from("reservation_guests").delete().in("reservation_id", reservationIds);
    if (error) return { ok: false, error: `reservation_guests: ${error.message}` };
  }

  const { error: flagsError } = await h()
    .from("room_unit_flags")
    .update({
      dnd: false,
      security_hold: false,
      staff_restricted: false,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId);
  if (flagsError) {
    return { ok: false, error: `room_unit_flags: ${flagsError.message}` };
  }

  const { error: roomsError } = await h()
    .from("room_units")
    .update({ status: "vacant_clean", notes: null })
    .eq("tenant_id", tenantId);
  if (roomsError) {
    return { ok: false, error: `room_units: ${roomsError.message}` };
  }

  return { ok: true };
}
