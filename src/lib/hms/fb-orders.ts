import type { SupabaseClient } from "@supabase/supabase-js";
import { insertFolioLine } from "@/lib/hms/folio";
import { isKitchenWorkComplete, isOrderFullyServed } from "@/lib/hms/fb-order-timing";
import type {
  FbKitchenStatus,
  FbKitchenTicket,
  FbOrderItemRow,
  FbOrderRow,
  FbOrderSettlementMethod,
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
  ready_acknowledged_at: (r.ready_acknowledged_at as string) ?? null,
    kitchen_ready_at: (r.kitchen_ready_at as string) ?? null,
    served_at: (r.served_at as string) ?? null,
  closed_at: (r.closed_at as string) ?? null,
    voided_at: (r.voided_at as string) ?? null,
    settlement_method: (r.settlement_method as FbOrderRow["settlement_method"]) ?? null,
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
  const menuItemIds = [
    ...new Set(
      orderRows.flatMap((o) =>
        (itemsByOrder.get(o.id) ?? []).map((i) => i.menu_item_id).filter(Boolean),
      ),
    ),
  ] as string[];

  const [{ data: tables }, { data: outlets }, prepByMenuItem] = await Promise.all([
    tableIds.length
      ? supabase.schema("hotel").from("fb_tables").select("id,table_code").in("id", tableIds)
      : Promise.resolve({ data: [] }),
    supabase.schema("hotel").from("fb_outlets").select("id,name,outlet_type").in("id", outletIds),
    loadPrepMinutesByMenuItem(supabase, tenantId, menuItemIds),
  ]);

  const tableById = new Map((tables ?? []).map((t) => [t.id as string, t.table_code as string]));
  const outletById = new Map(
    (outlets ?? []).map((o) => [
      o.id as string,
      { name: o.name as string, type: o.outlet_type as string },
    ]),
  );

  return orderRows.map((order) => {
    const items = itemsByOrder.get(order.id) ?? [];
    return {
      ...order,
      items,
      table_code: order.table_id ? (tableById.get(order.table_id) ?? null) : null,
      outlet_name: outletById.get(order.outlet_id)?.name,
      outlet_type: outletById.get(order.outlet_id)?.type as FbOrderWithItems["outlet_type"],
      category_overdue_minutes: orderCategoryOverdueMinutes(items, prepByMenuItem),
    };
  });
}

/** menu_item_id -> its category's prep_minutes (null when the category has no override). */
async function loadPrepMinutesByMenuItem(
  supabase: SupabaseClient,
  tenantId: string,
  menuItemIds: string[],
): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (!menuItemIds.length) return map;

  const { data: items } = await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .select("id,category_id")
    .eq("tenant_id", tenantId)
    .in("id", menuItemIds);

  const categoryIds = [
    ...new Set((items ?? []).map((i) => i.category_id).filter(Boolean)),
  ] as string[];

  const prepByCategory = new Map<string, number | null>();
  if (categoryIds.length) {
    const { data: cats } = await supabase
      .schema("hotel")
      .from("fb_menu_categories")
      .select("id,prep_minutes")
      .eq("tenant_id", tenantId)
      .in("id", categoryIds);
    for (const c of cats ?? []) {
      const raw = (c as Record<string, unknown>).prep_minutes;
      prepByCategory.set(
        c.id as string,
        raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw),
      );
    }
  }

  for (const it of items ?? []) {
    const cat = it.category_id as string | null;
    map.set(it.id as string, cat ? (prepByCategory.get(cat) ?? null) : null);
  }
  return map;
}

/** Effective cook-time target for an order = slowest category among its items (null = none set). */
function orderCategoryOverdueMinutes(
  items: FbOrderItemRow[],
  prepByMenuItem: Map<string, number | null>,
): number | null {
  let max: number | null = null;
  for (const it of items) {
    if (!it.menu_item_id) continue;
    const prep = prepByMenuItem.get(it.menu_item_id);
    if (prep != null && (max == null || prep > max)) max = prep;
  }
  return max;
}

export async function loadOrderById(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
): Promise<FbOrderWithItems | null> {
  const { data } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("*")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return null;

  const order = mapOrder(data as Record<string, unknown>);
  const itemsByOrder = await loadOrderItems(supabase, [orderId]);
  const items = itemsByOrder.get(orderId) ?? [];

  const [{ data: table }, { data: outlet }] = await Promise.all([
    order.table_id
      ? supabase
          .schema("hotel")
          .from("fb_tables")
          .select("id,table_code")
          .eq("id", order.table_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .schema("hotel")
      .from("fb_outlets")
      .select("id,name,outlet_type")
      .eq("id", order.outlet_id)
      .maybeSingle(),
  ]);

  return {
    ...order,
    items,
    table_code: table ? (table.table_code as string) : null,
    outlet_name: outlet ? (outlet.name as string) : undefined,
    outlet_type: outlet ? (outlet.outlet_type as FbOrderWithItems["outlet_type"]) : undefined,
  };
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
    rush?: boolean;
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
      rush: Boolean(params.rush),
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
  const full = await loadOrderById(supabase, tenantId, orderId);
  return { order: full, error: null };
}

export async function markFbOrderServed(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
) {
  const order = await loadOrderById(supabase, tenantId, orderId);
  if (!order) return { order: null, error: "Order not found." };
  if (order.status !== "ready") {
    return { order: null, error: "Order is not ready for service." };
  }

  const hasReady = order.items.some((item) => item.kitchen_status === "ready");
  if (!hasReady) {
    return { order: null, error: "No ready items to mark as served." };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ kitchen_status: "served", updated_at: now })
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId)
    .eq("kitchen_status", "ready");

  if (error) return { order: null, error: error.message };

  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ ready_acknowledged_at: now, updated_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .is("ready_acknowledged_at", null);

  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ served_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .is("served_at", null);

  const full = await loadOrderById(supabase, tenantId, orderId);
  return { order: full, error: null };
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
    const readyNow = new Date().toISOString();
    await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ status: "ready", updated_at: readyNow })
      .eq("id", orderId)
      .eq("tenant_id", tenantId);
    await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ kitchen_ready_at: readyNow })
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .is("kitchen_ready_at", null);
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
  options?: { settlementMethod?: FbOrderSettlementMethod },
) {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: "closed", closed_at: now, updated_at: now };
  if (options?.settlementMethod) {
    patch.settlement_method = options.settlementMethod;
  }
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update(patch)
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

  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ served_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .is("served_at", null);

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
    .in("status", ["open", "sent_to_kitchen", "ready"])
    .select("*")
    .maybeSingle();

  if (error || !data) return { order: null, error: error?.message ?? "Could not cancel order." };

  await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ kitchen_status: "voided", updated_at: now })
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId);

  if (data.table_id) {
    await supabase
      .schema("hotel")
      .from("fb_tables")
      .update({ status: "available" })
      .eq("id", data.table_id);
  }

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

export async function acknowledgeFbOrdersReady(
  supabase: SupabaseClient,
  tenantId: string,
  orderIds: string[],
) {
  const uniqueIds = [...new Set(orderIds.filter(Boolean))];
  if (!uniqueIds.length) return { error: null };

  const now = new Date().toISOString();
  const { error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ ready_acknowledged_at: now, updated_at: now })
    .eq("tenant_id", tenantId)
    .in("id", uniqueIds)
    .in("status", ["sent_to_kitchen", "ready"])
    .is("ready_acknowledged_at", null);

  if (error) return { error: error.message };
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
    if (isOrderFullyServed(order.items)) continue;

    const activeItems = order.items.filter(
      (i) => i.kitchen_status !== "voided" && i.kitchen_status !== "served",
    );
    if (!activeItems.length) continue;

    let items = activeItems;
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
      overdue_minutes: order.category_overdue_minutes ?? null,
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

export type FbOrderHistoryRange =
  | "all"
  | "today"
  | "yesterday"
  | "last_week"
  | "last_2_weeks"
  | "last_month";

function orderHistoryClosedAt(order: FbOrderWithItems) {
  return new Date(order.closed_at ?? order.voided_at ?? order.updated_at);
}

export function orderMatchesHistoryRange(order: FbOrderWithItems, range: FbOrderHistoryRange) {
  if (range === "all") return true;

  const closed = orderHistoryClosedAt(order);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (range === "today") {
    return closed.getTime() >= startOfToday.getTime();
  }

  if (range === "yesterday") {
    const startYesterday = new Date(startOfToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    return closed.getTime() >= startYesterday.getTime() && closed.getTime() < startOfToday.getTime();
  }

  const start = new Date(startOfToday);
  if (range === "last_week") start.setDate(start.getDate() - 7);
  if (range === "last_2_weeks") start.setDate(start.getDate() - 14);
  if (range === "last_month") start.setMonth(start.getMonth() - 1);

  return closed.getTime() >= start.getTime();
}

/**
 * Restaurant / F&B history: settled tickets (closed / voided) plus tickets that are
 * done but still awaiting payment (fully served, or kitchen finished and not yet paid).
 * Unlike kitchen history, bar tickets that never went to the kitchen still count.
 */
export function isFbOrderHistoryEligible(order: FbOrderWithItems) {
  if (order.status === "closed" || order.status === "voided") return true;
  if (isOrderFullyServed(order.items)) return true;
  if (order.sent_to_kitchen_at && isKitchenWorkComplete(order.items)) return true;
  return false;
}

export async function loadFbOrderHistory(
  supabase: SupabaseClient,
  tenantId: string,
  range: FbOrderHistoryRange = "all",
) {
  const orders = await loadOrders(supabase, tenantId, { limit: 500 });

  return orders
    .filter(isFbOrderHistoryEligible)
    .filter((o) => orderMatchesKitchenHistoryRange(o, range))
    .sort(
      (a, b) => kitchenTicketHistoryAt(b).getTime() - kitchenTicketHistoryAt(a).getTime(),
    );
}

/** Kitchen finished tickets — includes served-but-awaiting-payment, not only F&B-closed. */
export function isKitchenTicketHistoryEligible(order: FbOrderWithItems) {
  if (!order.sent_to_kitchen_at) return false;
  if (order.status === "voided" || order.status === "closed") return true;
  if (isOrderFullyServed(order.items)) return true;
  return isKitchenWorkComplete(order.items);
}

export function kitchenTicketHistoryAt(order: FbOrderWithItems) {
  if (order.closed_at) return new Date(order.closed_at);
  if (order.voided_at) return new Date(order.voided_at);
  if (isOrderFullyServed(order.items) || isKitchenWorkComplete(order.items)) {
    return new Date(order.updated_at);
  }
  return new Date(order.sent_to_kitchen_at ?? order.created_at);
}

/** When the kitchen finished prep — used for cook-time duration and history badges. */
export function kitchenTicketTimingEnd(order: FbOrderWithItems): string {
  if (order.kitchen_ready_at) return order.kitchen_ready_at;
  if (order.voided_at) return order.voided_at;
  if (order.closed_at) return order.closed_at;
  if (isOrderFullyServed(order.items) || isKitchenWorkComplete(order.items)) {
    return order.updated_at;
  }
  return order.sent_to_kitchen_at ?? order.created_at;
}

export function orderMatchesKitchenHistoryRange(
  order: FbOrderWithItems,
  range: FbOrderHistoryRange,
) {
  if (range === "all") return true;

  const completed = kitchenTicketHistoryAt(order);
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  if (range === "today") {
    return completed.getTime() >= startOfToday.getTime();
  }

  if (range === "yesterday") {
    const startYesterday = new Date(startOfToday);
    startYesterday.setDate(startYesterday.getDate() - 1);
    return (
      completed.getTime() >= startYesterday.getTime() &&
      completed.getTime() < startOfToday.getTime()
    );
  }

  const start = new Date(startOfToday);
  if (range === "last_week") start.setDate(start.getDate() - 7);
  if (range === "last_2_weeks") start.setDate(start.getDate() - 14);
  if (range === "last_month") start.setMonth(start.getMonth() - 1);

  return completed.getTime() >= start.getTime();
}

export async function loadKitchenOrderHistory(
  supabase: SupabaseClient,
  tenantId: string,
  range: FbOrderHistoryRange = "all",
) {
  const orders = await loadOrders(supabase, tenantId, { limit: 500 });

  return orders
    .filter(isKitchenTicketHistoryEligible)
    .filter((o) => orderMatchesKitchenHistoryRange(o, range))
    .sort(
      (a, b) => kitchenTicketHistoryAt(b).getTime() - kitchenTicketHistoryAt(a).getTime(),
    );
}

/** @deprecated Use loadKitchenOrderHistory */
export async function loadKitchenHistory(
  supabase: SupabaseClient,
  tenantId: string,
  range: FbOrderHistoryRange = "all",
) {
  return loadKitchenOrderHistory(supabase, tenantId, range);
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
