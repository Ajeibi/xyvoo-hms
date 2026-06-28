import type { SupabaseClient } from "@supabase/supabase-js";
import { insertFolioLine } from "@/lib/hms/folio";
import type {
  FbKitchenStatus,
  FbKitchenTicket,
  FbOrderItemRow,
  FbOrderRow,
  FbOrderStatus,
  FbOrderWithItems,
} from "@/lib/hms/fb-types";

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
}

function orderNumber() {
  return `FB-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

function mapOrder(r: Record<string, unknown>): FbOrderRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    outlet_id: r.outlet_id as string,
    order_number: r.order_number as string,
    table_id: (r.table_id as string) ?? null,
    tab_label: (r.tab_label as string) ?? null,
    reservation_id: (r.reservation_id as string) ?? null,
    status: r.status as FbOrderStatus,
    rush: Boolean(r.rush),
    placed_by: (r.placed_by as string) ?? null,
    sent_to_kitchen_at: (r.sent_to_kitchen_at as string) ?? null,
    closed_at: (r.closed_at as string) ?? null,
    voided_at: (r.voided_at as string) ?? null,
    subtotal: num(r.subtotal),
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
  };
}

export function mapOrderItem(r: Record<string, unknown>): FbOrderItemRow {
  return {
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    order_id: r.order_id as string,
    menu_item_id: (r.menu_item_id as string) ?? null,
    name_snapshot: r.name_snapshot as string,
    price_snapshot: num(r.price_snapshot),
    quantity: Number(r.quantity) || 1,
    station_id: (r.station_id as string) ?? null,
    station_code_snapshot: (r.station_code_snapshot as string) ?? null,
    kitchen_status: r.kitchen_status as FbKitchenStatus,
    notes: (r.notes as string) ?? null,
    created_at: r.created_at as string,
  };
}

async function loadOrderItems(supabase: SupabaseClient, orderIds: string[]) {
  if (!orderIds.length) return new Map<string, FbOrderItemRow[]>();
  const { data } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .select("*")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });

  const byOrder = new Map<string, FbOrderItemRow[]>();
  for (const row of data ?? []) {
    const item = mapOrderItem(row as Record<string, unknown>);
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }
  return byOrder;
}

export async function recalcOrderSubtotal(supabase: SupabaseClient, orderId: string, tenantId: string) {
  const { data: items } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .select("price_snapshot,quantity")
    .eq("order_id", orderId)
    .neq("kitchen_status", "voided");

  const subtotal = (items ?? []).reduce((sum, i) => sum + num(i.price_snapshot) * num(i.quantity), 0);
  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ subtotal, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  return Math.round(subtotal * 100) / 100;
}

export async function loadOrders(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { status?: FbOrderStatus[]; limit?: number },
): Promise<FbOrderWithItems[]> {
  let q = supabase
    .schema("hotel")
    .from("fb_orders")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(opts?.limit ?? 50);

  if (opts?.status?.length) {
    q = q.in("status", opts.status);
  }

  const { data: orders } = await q;
  const orderRows = (orders ?? []).map((r) => mapOrder(r as Record<string, unknown>));
  const itemsByOrder = await loadOrderItems(
    supabase,
    orderRows.map((o) => o.id),
  );

  const tableIds = [...new Set(orderRows.map((o) => o.table_id).filter(Boolean))] as string[];
  const outletIds = [...new Set(orderRows.map((o) => o.outlet_id))];

  const [{ data: tables }, { data: outlets }] = await Promise.all([
    tableIds.length
      ? supabase.schema("hotel").from("fb_tables").select("id,table_code").in("id", tableIds)
      : Promise.resolve({ data: [] }),
    supabase.schema("hotel").from("fb_outlets").select("id,name,outlet_type").in("id", outletIds),
  ]);

  const tableById = new Map((tables ?? []).map((t) => [t.id as string, t.table_code as string]));
  const outletById = new Map(
    (outlets ?? []).map((o) => [
      o.id as string,
      { name: o.name as string, type: o.outlet_type as string },
    ]),
  );

  return orderRows.map((order) => ({
    ...order,
    items: itemsByOrder.get(order.id) ?? [],
    table_code: order.table_id ? (tableById.get(order.table_id) ?? null) : null,
    outlet_name: outletById.get(order.outlet_id)?.name,
    outlet_type: outletById.get(order.outlet_id)?.type as FbOrderWithItems["outlet_type"],
  }));
}

export async function createFbOrder(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    outletId: string;
    tableId?: string | null;
    tabLabel?: string | null;
    reservationId?: string | null;
    placedBy: string;
    notes?: string;
  },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .insert({
      tenant_id: params.tenantId,
      outlet_id: params.outletId,
      order_number: orderNumber(),
      table_id: params.tableId ?? null,
      tab_label: params.tabLabel?.trim() ?? null,
      reservation_id: params.reservationId ?? null,
      placed_by: params.placedBy,
      notes: params.notes ?? null,
      status: "open",
    })
    .select("*")
    .single();

  if (error || !data) return { order: null, error: error?.message ?? "Could not create order." };
  return { order: mapOrder(data as Record<string, unknown>), error: null };
}

export async function addOrderItem(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    orderId: string;
    menuItemId: string;
  },
) {
  const { data: order } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("id,status,tenant_id")
    .eq("id", params.orderId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (!order) return { item: null, error: "Order not found." };
  if (!["open", "sent_to_kitchen"].includes(order.status as string)) {
    return { item: null, error: "Order cannot be modified." };
  }

  const { data: menuItem } = await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .select("*")
    .eq("id", params.menuItemId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (!menuItem || !menuItem.is_available) {
    return { item: null, error: "Menu item unavailable." };
  }

  let stationCode: string | null = null;
  if (menuItem.station_id) {
    const { data: station } = await supabase
      .schema("hotel")
      .from("fb_stations")
      .select("code")
      .eq("id", menuItem.station_id)
      .maybeSingle();
    stationCode = (station?.code as string) ?? null;
  }

  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .insert({
      tenant_id: params.tenantId,
      order_id: params.orderId,
      menu_item_id: params.menuItemId,
      name_snapshot: menuItem.name,
      price_snapshot: num(menuItem.price),
      quantity: 1,
      station_id: menuItem.station_id,
      station_code_snapshot: stationCode ?? null,
      kitchen_status: "pending",
    })
    .select("*")
    .single();

  if (error || !data) return { item: null, error: error?.message ?? "Could not add item." };
  await recalcOrderSubtotal(supabase, params.orderId, params.tenantId);
  return { item: mapOrderItem(data as Record<string, unknown>), error: null };
}

export async function sendOrderToKitchen(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({
      status: "sent_to_kitchen",
      sent_to_kitchen_at: now,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .in("status", ["open", "sent_to_kitchen"])
    .select("*")
    .maybeSingle();

  if (error || !data) return { order: null, error: error?.message ?? "Could not send to kitchen." };

  const { data: table } = data.table_id
    ? await supabase
        .schema("hotel")
        .from("fb_tables")
        .update({ status: "seated" })
        .eq("id", data.table_id)
        .select("id")
    : { data: null };

  void table;
  return { order: mapOrder(data as Record<string, unknown>), error: null };
}

export async function updateOrderItemKitchenStatus(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  kitchenStatus: FbKitchenStatus,
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ kitchen_status: kitchenStatus, updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error || !data) return { item: null, error: error?.message ?? "Could not update item." };

  const orderId = data.order_id as string;
  const itemsByOrder = await loadOrderItems(supabase, [orderId]);
  const items = itemsByOrder.get(orderId) ?? [];
  const allReady = items.every((i) =>
    ["ready", "served", "voided"].includes(i.kitchen_status),
  );
  const anyActive = items.some((i) => !["voided", "served"].includes(i.kitchen_status));

  if (allReady && anyActive) {
    await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", orderId)
      .eq("tenant_id", tenantId);
  }

  return { item: mapOrderItem(data as Record<string, unknown>), error: null };
}

export async function setOrderRush(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  rush: boolean,
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ rush, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error || !data) return { order: null, error: error?.message ?? "Could not update order." };
  return { order: mapOrder(data as Record<string, unknown>), error: null };
}

export async function closeFbOrder(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ status: "closed", closed_at: now, updated_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .neq("status", "voided")
    .select("*")
    .maybeSingle();

  if (error || !data) return { order: null, error: error?.message ?? "Could not close order." };

  await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ kitchen_status: "served", updated_at: now })
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .neq("kitchen_status", "voided");

  if (data.table_id) {
    await supabase
      .schema("hotel")
      .from("fb_tables")
      .update({ status: "dirty" })
      .eq("id", data.table_id);
  }

  return { order: mapOrder(data as Record<string, unknown>), error: null };
}

export async function voidFbOrder(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  reason?: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({
      status: "voided",
      voided_at: now,
      void_reason: reason ?? null,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error || !data) return { order: null, error: error?.message ?? "Could not void order." };

  await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ kitchen_status: "voided", updated_at: now })
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId);

  return { order: mapOrder(data as Record<string, unknown>), error: null };
}

export async function eightySixMenuItem(
  supabase: SupabaseClient,
  tenantId: string,
  menuItemId: string,
  userId: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .update({
      is_available: false,
      eighty_sixed_at: now,
      eighty_sixed_by: userId,
      updated_at: now,
    })
    .eq("id", menuItemId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error || !data) return { error: error?.message ?? "Could not 86 item." };
  return { error: null };
}

export async function loadKitchenBoard(
  supabase: SupabaseClient,
  tenantId: string,
  stationCode?: string | null,
): Promise<FbKitchenTicket[]> {
  const orders = await loadOrders(supabase, tenantId, {
    status: ["sent_to_kitchen", "ready"],
    limit: 80,
  });

  const tickets: FbKitchenTicket[] = [];

  for (const order of orders) {
    let items = order.items.filter((i) => i.kitchen_status !== "voided" && i.kitchen_status !== "served");
    if (stationCode && stationCode !== "all") {
      items = items.filter((i) => i.station_code_snapshot === stationCode);
    }
    if (!items.length) continue;

    const tableLabel =
      order.table_code ?? order.tab_label ?? order.outlet_name ?? "Order";

    tickets.push({
      id: order.id,
      order_number: order.order_number,
      table_label: tableLabel,
      rush: order.rush,
      created_at: order.created_at,
      sent_to_kitchen_at: order.sent_to_kitchen_at,
      status: order.status,
      items: items.map((i) => ({
        id: i.id,
        name: i.name_snapshot,
        quantity: i.quantity,
        kitchen_status: i.kitchen_status,
        station_code: i.station_code_snapshot,
        menu_item_id: i.menu_item_id,
      })),
    });
  }

  tickets.sort((a, b) => {
    if (a.rush !== b.rush) return a.rush ? -1 : 1;
    const ta = new Date(a.sent_to_kitchen_at ?? a.created_at).getTime();
    const tb = new Date(b.sent_to_kitchen_at ?? b.created_at).getTime();
    return ta - tb;
  });

  return tickets;
}

export async function loadKitchenHistory(supabase: SupabaseClient, tenantId: string) {
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);

  const orders = await loadOrders(supabase, tenantId, {
    status: ["closed", "voided"],
    limit: 100,
  });

  return orders.filter((o) => {
    const closed = o.closed_at ?? o.voided_at ?? o.updated_at;
    return new Date(closed).getTime() >= startOfDay.getTime();
  });
}

export async function postOrderToFolio(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    orderId: string;
    reservationId: string;
    postedBy: string;
  },
) {
  const { data: order } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("*")
    .eq("id", params.orderId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (!order) return { error: "Order not found." };
  const amount = num(order.subtotal);
  if (amount <= 0) return { error: "Order has no charges." };

  const { line, error } = await insertFolioLine(supabase, {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    kind: "charge",
    amount,
    method: "system",
    description: `F&B order ${order.order_number}`,
    department: "food_beverage",
    postedBy: params.postedBy,
  });

  if (error || !line) return { error: error ?? "Could not post to folio." };
  return { error: null, line };
}

export async function postOrderPayment(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    orderId: string;
    reservationId: string;
    amount: number;
    method: "cash" | "card" | "pos";
    postedBy: string;
    cashFloatSessionId?: string;
  },
) {
  const { line, error } = await insertFolioLine(supabase, {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    kind: "payment",
    amount: params.amount,
    method: params.method,
    description: `F&B payment (${params.method})`,
    department: "food_beverage",
    postedBy: params.postedBy,
    cashFloatSessionId: params.cashFloatSessionId,
  });

  if (error || !line) return { error: error ?? "Could not post payment." };
  return { error: null, line };
}
