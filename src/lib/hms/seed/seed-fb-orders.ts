import type { SupabaseClient } from "@supabase/supabase-js";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import {
  fixtureNumericKey,
  MENU_ITEM_ALIASES,
  orderFixtureUuid,
  reservationIdFromStayRef,
} from "./fixture-ids";
import { resolveFixtureDate } from "./resolve-fixture-date";
import type { FbOrderSample, FbOrdersSampleFile } from "./samples/fb-orders-sample.types";

type MenuRow = {
  id: string;
  name: string;
  price: number;
  outlet_id: string;
  station_id: string | null;
};

type OutletRow = { id: string; code: string };
type TableRow = { id: string; table_code: string; outlet_id: string };
type StationRow = { id: string; code: string };

async function upsertBatch(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.schema("hotel").from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
}

function resolveMenuName(raw: string): string {
  return MENU_ITEM_ALIASES[raw] ?? raw;
}

export type SeedFbOrdersResult =
  | { ok: true; message: string; counts: { orders: number; items: number; folio: number } }
  | { ok: false; error: string };

export async function seedFbOrdersFromFixture(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
  fixture: FbOrdersSampleFile,
): Promise<SeedFbOrdersResult> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant || tenant.id !== tenantId) {
    return { ok: false, error: "Tenant not found." };
  }

  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const currency = pricing.currency;
  const now = new Date();
  const warnings: string[] = [];

  const [
    { data: outlets, error: outletErr },
    { data: tables, error: tableErr },
    { data: menuItems, error: menuErr },
    { data: stations, error: stationErr },
    { data: reservations, error: resErr },
  ] = await Promise.all([
    supabase.schema("hotel").from("fb_outlets").select("id,code").eq("tenant_id", tenantId),
    supabase.schema("hotel").from("fb_tables").select("id,table_code,outlet_id").eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("fb_menu_items")
      .select("id,name,price,outlet_id,station_id")
      .eq("tenant_id", tenantId),
    supabase.schema("hotel").from("fb_stations").select("id,code").eq("tenant_id", tenantId),
    supabase.schema("hotel").from("reservations").select("id,confirmation_code").eq("tenant_id", tenantId),
  ]);

  if (outletErr) return { ok: false, error: outletErr.message };
  if (tableErr) return { ok: false, error: tableErr.message };
  if (menuErr) return { ok: false, error: menuErr.message };
  if (stationErr) return { ok: false, error: stationErr.message };
  if (resErr) return { ok: false, error: resErr.message };

  const outletByCode = new Map((outlets ?? []).map((o) => [(o as OutletRow).code, o as OutletRow]));
  const tableByCode = new Map((tables ?? []).map((t) => [(t as TableRow).table_code, t as TableRow]));
  const stationById = new Map((stations ?? []).map((s) => [(s as StationRow).id, s as StationRow]));
  const reservationByCode = new Map(
    (reservations ?? []).map((r) => [r.confirmation_code as string, r.id as string]),
  );

  function menuByName(outletId: string, name: string, orderRef: string): MenuRow | undefined {
    const resolved = resolveMenuName(name);
    const items = (menuItems ?? []) as MenuRow[];
    const onOutlet =
      items.find((m) => m.outlet_id === outletId && m.name === resolved) ??
      items.find((m) => m.outlet_id === outletId && m.name.toLowerCase() === resolved.toLowerCase());
    if (onOutlet) return onOutlet;

    const anywhere =
      items.find((m) => m.name === resolved) ??
      items.find((m) => m.name.toLowerCase() === resolved.toLowerCase());
    if (anywhere) {
      warnings.push(`${orderRef}: "${name}" resolved from another outlet catalog.`);
      return anywhere;
    }
    return undefined;
  }

  function resolveReservation(order: FbOrderSample): string | null {
    if (order.confirmation_code) {
      const id = reservationByCode.get(order.confirmation_code);
      if (id) return id;
    }
    if (order.reservation_ref) {
      try {
        return reservationIdFromStayRef(order.reservation_ref);
      } catch {
        return null;
      }
    }
    return null;
  }

  const orderRows: Record<string, unknown>[] = [];
  const itemRows: Record<string, unknown>[] = [];
  const folioRows: Record<string, unknown>[] = [];

  for (const order of fixture.orders) {
    const ok = fixtureNumericKey(order.ref);
    const orderId = orderFixtureUuid("order", ok);
    const outlet = outletByCode.get(order.outlet);
    if (!outlet) {
      return { ok: false, error: `${order.ref}: outlet "${order.outlet}" not found.` };
    }

    let tableId: string | null = null;
    if (order.table_code) {
      const table = tableByCode.get(order.table_code);
      if (!table) {
        warnings.push(`${order.ref}: table ${order.table_code} not found — order has no table.`);
      } else {
        tableId = table.id;
      }
    }

    const placedAt = resolveFixtureDate(order.placed_at ?? order.sent_to_kitchen_at ?? "now", now);
    const sentAt = order.sent_to_kitchen_at ? resolveFixtureDate(order.sent_to_kitchen_at, now) : null;
    const kitchenReadyAt = order.kitchen_ready_at ? resolveFixtureDate(order.kitchen_ready_at, now) : null;
    const servedAt = order.served_at ? resolveFixtureDate(order.served_at, now) : null;
    const readyAckAt = order.ready_acknowledged_at
      ? resolveFixtureDate(order.ready_acknowledged_at, now)
      : null;
    const closedAt = order.closed_at ? resolveFixtureDate(order.closed_at, now) : null;
    const voidedAt = order.voided_at
      ? resolveFixtureDate(order.voided_at, now)
      : order.status === "voided"
        ? closedAt ?? sentAt ?? placedAt
        : null;

    const reservationId = resolveReservation(order);

    let subtotal = 0;
    const builtItems: Record<string, unknown>[] = [];

    order.items.forEach((line, idx) => {
      const menu = menuByName(outlet.id, line.menu_item, order.ref);
      if (!menu) {
        warnings.push(`${order.ref}: menu item "${line.menu_item}" not found — skipped.`);
        return;
      }
      const price = line.price ?? Number(menu.price);
      subtotal += price * line.quantity;
      const station = menu.station_id ? stationById.get(menu.station_id) : null;

      builtItems.push({
        id: orderFixtureUuid("item", ok * 100 + idx),
        tenant_id: tenantId,
        order_id: orderId,
        menu_item_id: menu.id,
        name_snapshot: menu.name,
        price_snapshot: price,
        quantity: line.quantity,
        station_id: menu.station_id,
        station_code_snapshot: station?.code ?? null,
        kitchen_status: line.kitchen_status ?? "pending",
        notes: line.notes ?? null,
        created_at: sentAt ?? placedAt,
        updated_at: closedAt ?? servedAt ?? kitchenReadyAt ?? sentAt ?? placedAt,
      });
    });

    if (!builtItems.length) {
      return { ok: false, error: `${order.ref}: no valid menu items.` };
    }

    if (order.subtotal != null) subtotal = order.subtotal;

    orderRows.push({
      id: orderId,
      tenant_id: tenantId,
      outlet_id: outlet.id,
      order_number: `PJP-FB-${String(ok).padStart(5, "0")}`,
      table_id: tableId,
      tab_label: order.tab_label ?? null,
      reservation_id: reservationId,
      status: order.status,
      rush: order.rush ?? false,
      placed_by: null,
      sent_to_kitchen_at: sentAt,
      ready_acknowledged_at: readyAckAt,
      kitchen_ready_at: kitchenReadyAt,
      served_at: servedAt,
      closed_at: closedAt,
      voided_at: voidedAt,
      void_reason: order.status === "voided" ? (order.void_reason ?? order.notes ?? "Voided — seed") : null,
      settlement_method: order.status === "closed" ? order.settlement_method : null,
      subtotal,
      notes: order.notes ?? null,
      created_at: placedAt,
      updated_at: closedAt ?? voidedAt ?? servedAt ?? kitchenReadyAt ?? sentAt ?? placedAt,
    });

    itemRows.push(...builtItems);

    if (
      order.status === "closed" &&
      order.settlement_method === "room_charge" &&
      reservationId &&
      subtotal > 0
    ) {
      folioRows.push({
        id: orderFixtureUuid("folio", ok),
        tenant_id: tenantId,
        reservation_id: reservationId,
        kind: "charge",
        amount: subtotal,
        method: "system",
        status: "posted",
        description: `F&B — ${order.ref}`,
        department: "fb",
        posted_by: null,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        currency_code: currency,
        fx_rate: null,
        original_amount: null,
        original_currency: null,
        split_leg: "guest",
        related_reservation_id: null,
        cash_float_session_id: null,
        metadata: { seed: true, order_ref: order.ref },
        reference: `PJP-FB-CHG-${String(ok).padStart(5, "0")}`,
        created_at: closedAt ?? placedAt,
      });
    }
  }

  try {
    await upsertBatch(supabase, "fb_orders", orderRows);
    await upsertBatch(supabase, "fb_order_items", itemRows);
    if (folioRows.length) await upsertBatch(supabase, "folio_transactions", folioRows);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const byStatus = fixture.orders.reduce(
    (acc, o) => {
      acc[o.status] = (acc[o.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const closed = fixture.orders.filter((o) => o.status === "closed");
  const posCount = closed.filter((o) => o.settlement_method === "pos").length;
  const roomCount = closed.filter((o) => o.settlement_method === "room_charge").length;

  const warnText = warnings.length
    ? `\n  ⚠ ${warnings.length} note(s):\n    ${warnings.slice(0, 10).join("\n    ")}${warnings.length > 10 ? `\n    …and ${warnings.length - 10} more` : ""}`
    : "";

  return {
    ok: true,
    message:
      `F&B orders loaded: ${orderRows.length} orders (${Object.entries(byStatus)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ")}), ${itemRows.length} line items, ${folioRows.length} room-charge folio postings` +
      ` (${posCount} pos / ${roomCount} room_charge closed).` +
      warnText,
    counts: { orders: orderRows.length, items: itemRows.length, folio: folioRows.length },
  };
}

export function mergeFbOrderFixtures(files: FbOrdersSampleFile[]): FbOrdersSampleFile {
  return {
    _meta: { description: "Merged F&B order fixtures", version: 1 },
    orders: files.flatMap((f) => f.orders),
  };
}
