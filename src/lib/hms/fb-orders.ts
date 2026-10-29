import type { SupabaseClient } from "@supabase/supabase-js";
import { insertFolioLine } from "@/lib/hms/folio";
import { isKitchenWorkComplete, isOrderFullyServed } from "@/lib/hms/fb-order-timing";
import { listIngredientsForMenuItems } from "@/lib/hms/fb-menu-ingredients";
import {
  type FbChosenModifier,
  normaliseItemNote,
  resolveModifierSelection,
} from "@/lib/hms/fb-modifier-rules";
import { loadModifierGroupsForMenuItem, loadOrderItemModifiers } from "@/lib/hms/fb-modifiers";
import { mergeBlockReason, planSplit, splitBlockReason } from "@/lib/hms/fb-split-rules";
import { computeBillTotals } from "@/lib/hms/fb-bill-rules";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";
import { type FbPricingNow, loadPricingNow } from "@/lib/hms/fb-pricing";
import { priceWithRules } from "@/lib/hms/fb-price-rules";
import {
  courseLabel,
  defaultCourseFor,
  type FbFireMode,
  itemsToFire,
  itemsToFireForCourse,
} from "@/lib/hms/fb-course-rules";
import {
  type FbOutletTender,
  leftToPay,
  roomChargeBlockReason,
  roundMoney,
  settlementBlockReason,
} from "@/lib/hms/fb-payment-rules";
import { resolveTippedPayment } from "@/lib/hms/fb-tip-rules";
import { linkPaymentToOpenTill, openSessionIdForOutlet } from "@/lib/hms/fb-cashup";
import { postStockMovement } from "@/lib/hms/inventory-stock";
import type {
  FbKitchenStatus,
  FbKitchenTicket,
  FbOrderItemRow,
  FbOrderPayment,
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
  ready_acknowledged_at: (r.ready_acknowledged_at as string) ?? null,
    kitchen_ready_at: (r.kitchen_ready_at as string) ?? null,
    served_at: (r.served_at as string) ?? null,
  closed_at: (r.closed_at as string) ?? null,
    voided_at: (r.voided_at as string) ?? null,
    settlement_method: (r.settlement_method as FbOrderRow["settlement_method"]) ?? null,
    settled_at: (r.settled_at as string) ?? null,
    settled_by: (r.settled_by as string) ?? null,
    amount_tendered: r.amount_tendered == null ? null : num(r.amount_tendered),
    change_given: r.change_given == null ? null : num(r.change_given),
    paid_amount: num(r.paid_amount),
    items_total: num(r.items_total),
    service_charge_amount: num(r.service_charge_amount),
    levy_amount: num(r.levy_amount),
    vat_amount: num(r.vat_amount),
    service_charge_percent: num(r.service_charge_percent),
    levy_percent: num(r.levy_percent),
    vat_percent: num(r.vat_percent),
    prices_include_tax: r.prices_include_tax !== false,
    service_charge_waived_reason: (r.service_charge_waived_reason as string) ?? null,
    split_from_order_id: (r.split_from_order_id as string) ?? null,
    bill_number: r.bill_number == null ? 1 : Number(r.bill_number),
    merged_into_order_id: (r.merged_into_order_id as string) ?? null,
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
    modifiers: [],
    course: r.course == null ? 1 : Number(r.course),
    fired_at: (r.fired_at as string) ?? null,
    seat: r.seat == null ? null : Number(r.seat),
    void_reason: (r.void_reason as string) ?? null,
    voided_at: (r.voided_at as string) ?? null,
    comp_reason: (r.comp_reason as string) ?? null,
    comped_at: (r.comped_at as string) ?? null,
    original_price: r.original_price == null ? null : num(r.original_price),
    list_price: r.list_price == null ? null : num(r.list_price),
    price_rule_name: (r.price_rule_name as string) ?? null,
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

  const modifiersByItem = await loadOrderItemModifiers(
    supabase,
    (data ?? []).map((r) => r.id as string),
  );

  const byOrder = new Map<string, FbOrderItemRow[]>();
  for (const row of data ?? []) {
    const item = mapOrderItem(row as Record<string, unknown>);
    item.modifiers = modifiersByItem.get(item.id) ?? [];
    const list = byOrder.get(item.order_id) ?? [];
    list.push(item);
    byOrder.set(item.order_id, list);
  }
  return byOrder;
}

/** order_id -> its payments, oldest first. */
async function loadOrderPayments(supabase: SupabaseClient, orderIds: string[]) {
  const map = new Map<string, FbOrderPayment[]>();
  if (!orderIds.length) return map;
  const { data } = await supabase
    .schema("hotel")
    .from("fb_order_payments")
    .select("id,order_id,method,amount,amount_tendered,change_given,share_label,tip_amount,tip_staff_id,created_at")
    .in("order_id", orderIds)
    .order("created_at", { ascending: true });
  for (const r of data ?? []) {
    const list = map.get(r.order_id as string) ?? [];
    list.push({
      id: r.id as string,
      method: r.method as FbOrderPayment["method"],
      amount: num(r.amount),
      amount_tendered: r.amount_tendered == null ? null : num(r.amount_tendered),
      change_given: num(r.change_given),
      share_label: (r.share_label as string) ?? null,
      tip_amount: num(r.tip_amount),
      tip_staff_id: (r.tip_staff_id as string) ?? null,
      created_at: r.created_at as string,
    });
    map.set(r.order_id as string, list);
  }
  return map;
}

export async function recalcOrderSubtotal(supabase: SupabaseClient, orderId: string, tenantId: string) {
  const { data: items } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .select("price_snapshot,quantity")
    .eq("order_id", orderId)
    .neq("kitchen_status", "voided");

  const itemsTotal = (items ?? []).reduce((sum, i) => sum + num(i.price_snapshot) * num(i.quantity), 0);
  // Service charge and taxes use the rates copied onto this bill when it was opened.
  const { data: rates } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("service_charge_percent,levy_percent,vat_percent,prices_include_tax")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const totals = computeBillTotals(itemsTotal, {
    service_charge_percent: num(rates?.service_charge_percent),
    levy_percent: num(rates?.levy_percent),
    vat_percent: num(rates?.vat_percent),
    prices_include_tax: rates?.prices_include_tax !== false,
  });
  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({
      subtotal: totals.total,
      items_total: totals.itemsTotal,
      service_charge_amount: totals.serviceCharge,
      levy_amount: totals.levy,
      vat_amount: totals.vat,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  return totals.total;
}

export async function loadOrders(
  supabase: SupabaseClient,
  tenantId: string,
  opts?: { status?: FbOrderStatus[]; limit?: number; reservationId?: string },
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
  if (opts?.reservationId) {
    q = q.eq("reservation_id", opts.reservationId);
  }

  const { data: orders } = await q;
  const orderRows = (orders ?? []).map((r) => mapOrder(r as Record<string, unknown>));
  const [itemsByOrder, paymentsByOrder] = await Promise.all([
    loadOrderItems(
      supabase,
      orderRows.map((o) => o.id),
    ),
    loadOrderPayments(
      supabase,
      orderRows.filter((o) => o.paid_amount > 0).map((o) => o.id),
    ),
  ]);

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
      payments: paymentsByOrder.get(order.id) ?? [],
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
  const [itemsByOrder, paymentsByOrder] = await Promise.all([
    loadOrderItems(supabase, [orderId]),
    loadOrderPayments(supabase, order.paid_amount > 0 ? [orderId] : []),
  ]);
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
    payments: paymentsByOrder.get(orderId) ?? [],
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
  const { billRates } = await getTenantFbSettings(supabase, params.tenantId);
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .insert({
      ...billRates,
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

export type FbOrderLineInput = {
  menuItemId: string;
  modifierOptionIds?: string[];
  notes?: string | null;
  /** Leave out to use the category's default course. */
  course?: number | null;
  seat?: number | null;
};

export type ResolvedOrderLine = {
  menuItemId: string;
  name: string;
  unitPrice: number;
  /** Menu price before a price rule; null when none applied. */
  listPrice: number | null;
  priceRuleName: string | null;
  stationId: string | null;
  stationCode: string | null;
  notes: string | null;
  modifiers: FbChosenModifier[];
  course: number;
  seat: number | null;
};

/**
 * Checks one line (item, choices, note) and prices it, without writing
 * anything — so a whole ticket can be checked before the order is created.
 * The price is the menu price with choices, changed by any price rule running
 * now (pass `pricing` to load the rules once for a whole ticket).
 */
export async function resolveOrderLine(
  supabase: SupabaseClient,
  tenantId: string,
  line: FbOrderLineInput,
  pricing?: FbPricingNow,
): Promise<{ line: ResolvedOrderLine | null; error: string | null }> {
  const { data: menuItem } = await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .select("*")
    .eq("id", line.menuItemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!menuItem || !menuItem.is_available) {
    return { line: null, error: menuItem ? `${menuItem.name} is sold out.` : "Menu item unavailable." };
  }

  const groups = await loadModifierGroupsForMenuItem(supabase, tenantId, line.menuItemId);
  const basePrice = num(menuItem.price);
  const selection = resolveModifierSelection(groups, line.modifierOptionIds ?? [], basePrice);
  if (!selection.ok) return { line: null, error: `${menuItem.name}: ${selection.error}` };

  const [{ data: station }, { data: category }, { data: outlet }] = await Promise.all([
    menuItem.station_id
      ? supabase.schema("hotel").from("fb_stations").select("code").eq("id", menuItem.station_id).maybeSingle()
      : Promise.resolve({ data: null }),
    menuItem.category_id
      ? supabase.schema("hotel").from("fb_menu_categories").select("default_course").eq("id", menuItem.category_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.schema("hotel").from("fb_outlets").select("outlet_type").eq("id", menuItem.outlet_id).maybeSingle(),
  ]);

  const now = pricing ?? (await loadPricingNow(supabase, tenantId));
  const ruled = priceWithRules(
    roundMoney(basePrice + selection.priceDelta),
    { outlet_id: menuItem.outlet_id as string, category_id: (menuItem.category_id as string) ?? null },
    now.rules,
    now.clock,
  );

  const course =
    line.course != null
      ? line.course
      : defaultCourseFor(
          (category?.default_course as number | null | undefined) ?? null,
          (outlet?.outlet_type as string | undefined) ?? null,
        );

  return {
    line: {
      menuItemId: line.menuItemId,
      name: menuItem.name as string,
      unitPrice: ruled.price,
      listPrice: ruled.rule ? ruled.listPrice : null,
      priceRuleName: ruled.rule?.name ?? null,
      stationId: (menuItem.station_id as string) ?? null,
      stationCode: (station?.code as string) ?? null,
      notes: normaliseItemNote(line.notes),
      modifiers: selection.chosen,
      course,
      seat: line.seat ?? null,
    },
    error: null,
  };
}

export async function addOrderItem(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    orderId: string;
  } & FbOrderLineInput,
) {
  const { data: order } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("id,status,tenant_id,settlement_method,paid_amount")
    .eq("id", params.orderId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();

  if (!order) return { item: null, error: "Order not found." };
  if (order.settlement_method || num(order.paid_amount) > 0) {
    return { item: null, error: "This order has been paid. Start a new order for extra items." };
  }
  if (!["open", "sent_to_kitchen"].includes(order.status as string)) {
    return { item: null, error: "Order cannot be modified." };
  }

  const resolved = await resolveOrderLine(supabase, params.tenantId, params);
  if (!resolved.line) return { item: null, error: resolved.error ?? "Menu item unavailable." };
  const added = await insertResolvedOrderLine(supabase, params.tenantId, params.orderId, resolved.line);

  // Added to an order already in the kitchen: it goes now if its course is
  // straight away or already fired; otherwise it waits with its course.
  if (added.item && order.status !== "open") {
    await fireOrderItems(supabase, params.tenantId, params.orderId, "first_course", true);
  }
  return added;
}

/** Releases the lines chosen by the fire rules. Returns how many were fired. */
async function fireOrderItems(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  mode: FbFireMode,
  alreadySent: boolean,
) {
  const items = (await loadOrderItems(supabase, [orderId])).get(orderId) ?? [];
  return fireItemIds(supabase, tenantId, orderId, itemsToFire(items, mode, alreadySent));
}

async function fireItemIds(supabase: SupabaseClient, tenantId: string, orderId: string, ids: string[]) {
  if (!ids.length) return 0;
  const now = new Date().toISOString();
  const { data } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ fired_at: now, updated_at: now })
    .in("id", ids)
    .eq("tenant_id", tenantId)
    .is("fired_at", null)
    .select("id");
  const fired = data?.length ?? 0;
  if (fired) {
    // New work for the kitchen: the order is no longer "ready".
    await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ status: "sent_to_kitchen", updated_at: now })
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .eq("status", "ready");
  }
  return fired;
}

/** Fires one held course (or every held course) of an order already in the kitchen. */
export async function fireOrderCourse(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  course: number | "all",
) {
  const order = await loadOrderById(supabase, tenantId, orderId);
  if (!order) return { order: null, fired: 0, error: "Order not found." };
  if (!["sent_to_kitchen", "ready"].includes(order.status)) {
    return { order: null, fired: 0, error: "Send the order to the kitchen first." };
  }

  // A split table is still one sitting: firing mains fires them on every bill.
  const group = await loadBillGroup(supabase, tenantId, order);
  let fired = 0;
  let found = false;
  for (const bill of group) {
    if (!["sent_to_kitchen", "ready"].includes(bill.status)) continue;
    const ids = itemsToFireForCourse(bill.items, course);
    if (!ids.length) continue;
    found = true;
    fired += await fireItemIds(supabase, tenantId, bill.id, ids);
  }
  if (!found) {
    return { order: null, fired: 0, error: "Nothing is waiting to be fired for that course." };
  }
  return { order: await loadOrderById(supabase, tenantId, orderId), fired, error: null };
}

/** Every open bill of the table this order belongs to (just the order itself when it was never split). */
async function loadBillGroup(supabase: SupabaseClient, tenantId: string, order: FbOrderWithItems) {
  const rootId = order.split_from_order_id ?? order.id;
  const { data } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .or(`id.eq.${rootId},split_from_order_id.eq.${rootId}`)
    .in("status", ["open", "sent_to_kitchen", "ready"]);
  const ids = (data ?? []).map((r) => r.id as string);
  if (!ids.includes(order.id)) ids.push(order.id);
  const bills = await Promise.all(ids.map((id) => loadOrderById(supabase, tenantId, id)));
  return bills.filter((b): b is FbOrderWithItems => Boolean(b));
}

/**
 * Re-works an in-kitchen order's status from its lines after lines moved in
 * or out: "ready" when everything fired is ready and something is still to serve.
 */
async function refreshKitchenStatus(supabase: SupabaseClient, tenantId: string, orderId: string) {
  const order = await loadOrderById(supabase, tenantId, orderId);
  if (!order || !["sent_to_kitchen", "ready"].includes(order.status)) return;
  const fired = order.items.filter((i) => i.fired_at && i.kitchen_status !== "voided");
  const ready =
    fired.length > 0 &&
    fired.every((i) => i.kitchen_status === "ready" || i.kitchen_status === "served") &&
    fired.some((i) => i.kitchen_status === "ready");
  const status = ready ? "ready" : "sent_to_kitchen";
  if (status === order.status) return;
  const now = new Date().toISOString();
  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ status, updated_at: now, ...(ready && !order.kitchen_ready_at ? { kitchen_ready_at: now } : {}) })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
}

/**
 * Splits an order into separate bills. `billOf` maps each line to bill 1, 2, 3…;
 * bill 1 stays as this order and the others become new orders on the same
 * table, numbered after the first bill (e.g. FB-ABC123-2). Lines keep their
 * kitchen progress, course and choices. Each bill is then paid on its own.
 */
export async function splitFbOrder(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  billOf: Record<string, number>,
) {
  const order = await loadOrderById(supabase, tenantId, orderId);
  if (!order) return { orders: [], error: "Order not found." };
  const blocked = splitBlockReason(order);
  if (blocked) return { orders: [], error: blocked };
  const plan = planSplit(order.items, billOf);
  if (!plan.ok) return { orders: [], error: plan.error };

  const rootId = order.split_from_order_id ?? order.id;
  const root = rootId === order.id ? order : await loadOrderById(supabase, tenantId, rootId);
  const rootNumber = (root ?? order).order_number.replace(/-\d+$/, "");
  const { data: group } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("bill_number")
    .eq("tenant_id", tenantId)
    .or(`id.eq.${rootId},split_from_order_id.eq.${rootId}`);
  let nextBill = Math.max(1, ...(group ?? []).map((r) => Number(r.bill_number) || 1)) + 1;

  const created: FbOrderWithItems[] = [];
  for (const itemIds of plan.bills.slice(1)) {
    const billNumber = nextBill;
    nextBill += 1;
    const { data: bill, error } = await supabase
      .schema("hotel")
      .from("fb_orders")
      .insert({
        tenant_id: tenantId,
        outlet_id: order.outlet_id,
        order_number: `${rootNumber}-${billNumber}`,
        table_id: order.table_id,
        tab_label: order.tab_label,
        reservation_id: order.reservation_id,
        status: order.status,
        rush: order.rush,
        placed_by: order.placed_by,
        sent_to_kitchen_at: order.sent_to_kitchen_at,
        ready_acknowledged_at: order.ready_acknowledged_at,
        kitchen_ready_at: order.kitchen_ready_at,
        served_at: order.served_at,
        notes: order.notes,
        split_from_order_id: rootId,
        bill_number: billNumber,
        service_charge_percent: order.service_charge_percent,
        levy_percent: order.levy_percent,
        vat_percent: order.vat_percent,
        prices_include_tax: order.prices_include_tax,
        service_charge_waived_reason: order.service_charge_waived_reason,
      })
      .select("id")
      .single();
    if (error || !bill) return { orders: created, error: error?.message ?? "Could not create the new bill." };

    const { error: moveError } = await supabase
      .schema("hotel")
      .from("fb_order_items")
      .update({ order_id: bill.id, updated_at: new Date().toISOString() })
      .in("id", itemIds)
      .eq("order_id", orderId)
      .eq("tenant_id", tenantId);
    if (moveError) {
      await supabase.schema("hotel").from("fb_orders").delete().eq("id", bill.id);
      return { orders: created, error: moveError.message };
    }
    await recalcOrderSubtotal(supabase, bill.id as string, tenantId);
    await refreshKitchenStatus(supabase, tenantId, bill.id as string);
    const full = await loadOrderById(supabase, tenantId, bill.id as string);
    if (full) created.push(full);
  }

  await recalcOrderSubtotal(supabase, orderId, tenantId);
  await refreshKitchenStatus(supabase, tenantId, orderId);
  const first = await loadOrderById(supabase, tenantId, orderId);
  return { orders: first ? [first, ...created] : created, error: null };
}

/**
 * Combines `sourceId` into `targetId`: every line moves across and the source
 * is marked "merged". Works across tables (a party moving tables); the
 * source's table is freed if nothing else is open on it.
 */
export async function mergeFbOrders(
  supabase: SupabaseClient,
  tenantId: string,
  targetId: string,
  sourceId: string,
) {
  const [target, source] = await Promise.all([
    loadOrderById(supabase, tenantId, targetId),
    loadOrderById(supabase, tenantId, sourceId),
  ]);
  if (!target || !source) return { order: null, error: "Order not found." };
  const blocked = mergeBlockReason(target, source);
  if (blocked) return { order: null, error: blocked };

  const now = new Date().toISOString();
  const { error: moveError } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ order_id: targetId, updated_at: now })
    .eq("order_id", sourceId)
    .eq("tenant_id", tenantId);
  if (moveError) return { order: null, error: moveError.message };

  // Bills split from the source now hang off the target's group instead.
  const newRoot = target.split_from_order_id === sourceId ? targetId : (target.split_from_order_id ?? targetId);
  if (target.split_from_order_id === sourceId) {
    await supabase.schema("hotel").from("fb_orders").update({ split_from_order_id: null }).eq("id", targetId);
  }
  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ split_from_order_id: newRoot })
    .eq("tenant_id", tenantId)
    .eq("split_from_order_id", sourceId)
    .neq("id", newRoot);

  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ status: "merged", merged_into_order_id: targetId, subtotal: 0, updated_at: now })
    .eq("id", sourceId)
    .eq("tenant_id", tenantId);

  // Combining a bill already in the kitchen into one that wasn't sent yet sends it.
  if (target.status === "open" && source.sent_to_kitchen_at) {
    await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ status: "sent_to_kitchen", sent_to_kitchen_at: source.sent_to_kitchen_at, updated_at: now })
      .eq("id", targetId)
      .eq("tenant_id", tenantId);
  }

  await recalcOrderSubtotal(supabase, targetId, tenantId);
  await refreshKitchenStatus(supabase, tenantId, targetId);

  if (source.table_id && source.table_id !== target.table_id) {
    if (!(await tableHasOpenBills(supabase, tenantId, source.table_id))) {
      await supabase.schema("hotel").from("fb_tables").update({ status: "available" }).eq("id", source.table_id);
    }
  }

  return { order: await loadOrderById(supabase, tenantId, targetId), error: null };
}

/** Writes a line already checked by resolveOrderLine, with its choices, and updates the bill. */
export async function insertResolvedOrderLine(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  line: ResolvedOrderLine,
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .insert({
      tenant_id: tenantId,
      order_id: orderId,
      menu_item_id: line.menuItemId,
      name_snapshot: line.name,
      price_snapshot: line.unitPrice,
      list_price: line.listPrice,
      price_rule_name: line.priceRuleName,
      quantity: 1,
      station_id: line.stationId,
      station_code_snapshot: line.stationCode,
      kitchen_status: "pending",
      notes: line.notes,
      course: line.course,
      seat: line.seat,
    })
    .select("*")
    .single();

  if (error || !data) return { item: null, error: error?.message ?? "Could not add item." };

  if (line.modifiers.length) {
    const { error: modError } = await supabase
      .schema("hotel")
      .from("fb_order_item_modifiers")
      .insert(
        line.modifiers.map((m, index) => ({
          tenant_id: tenantId,
          order_item_id: data.id,
          option_id: m.optionId,
          group_name: m.groupName,
          option_name: m.optionName,
          price_delta: m.priceDelta,
          sort_order: index,
        })),
      );
    if (modError) {
      // Never leave a priced line without the choices that explain its price.
      await supabase.schema("hotel").from("fb_order_items").delete().eq("id", data.id);
      return { item: null, error: modError.message };
    }
  }

  await recalcOrderSubtotal(supabase, orderId, tenantId);
  const item = mapOrderItem(data as Record<string, unknown>);
  item.modifiers = line.modifiers.map((m) => ({
    group_name: m.groupName,
    option_name: m.optionName,
    price_delta: m.priceDelta,
  }));
  return { item, error: null };
}

export async function sendOrderToKitchen(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  mode: FbFireMode = "first_course",
) {
  const now = new Date().toISOString();
  const { data: before } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("sent_to_kitchen_at")
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const alreadySent = Boolean(before?.sent_to_kitchen_at);

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

  await fireOrderItems(supabase, tenantId, orderId, mode, alreadySent);

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

/**
 * Deducts each served item's mapped ingredients (recipe/BOM) from inventory
 * stock, one `issue` movement per ingredient. Idempotent: only processes
 * order items whose `ingredients_deducted_at` is still null, and always
 * stamps that column afterwards — even on a retried "served" transition, an
 * item is only ever deducted once. Insufficient stock on one ingredient is
 * logged and skipped rather than blocking the rest of the order — the food
 * has already left the kitchen by the time this runs.
 */
async function deductIngredientsForServedItems(
  supabase: SupabaseClient,
  tenantId: string,
  outletType: string | undefined,
  servedItemIds: string[],
  performedBy: string,
) {
  if (!servedItemIds.length) return;

  const { data: rows } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .select("id,menu_item_id,quantity")
    .eq("tenant_id", tenantId)
    .in("id", servedItemIds)
    .is("ingredients_deducted_at", null);

  const pending = (rows ?? []).filter((r) => r.menu_item_id);
  if (!pending.length) return;

  const menuItemIds = [...new Set(pending.map((r) => r.menu_item_id as string))];
  const ingredientsByMenuItem = await listIngredientsForMenuItems(supabase, tenantId, menuItemIds);
  const hasAnyRecipe = pending.some((r) => (ingredientsByMenuItem.get(r.menu_item_id as string) ?? []).length > 0);

  if (hasAnyRecipe) {
    const preferredType = outletType === "bar" ? "bar_store" : "kitchen_store";
    const { data: preferredLocation } = await supabase
      .schema("hotel")
      .from("inventory_locations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("location_type", preferredType)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    let locationId = (preferredLocation?.id as string) ?? null;
    if (!locationId) {
      const { data: anyLocation } = await supabase
        .schema("hotel")
        .from("inventory_locations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();
      locationId = (anyLocation?.id as string) ?? null;
    }

    if (locationId) {
      for (const row of pending) {
        const ingredients = ingredientsByMenuItem.get(row.menu_item_id as string) ?? [];
        const quantity = Number(row.quantity) || 1;
        for (const ingredient of ingredients) {
          const result = await postStockMovement(supabase, {
            tenantId,
            itemId: ingredient.inventory_item_id,
            locationId,
            movementType: "issue",
            qty: -(ingredient.qty_per_serving * quantity),
            referenceType: "fb_order_item",
            referenceId: row.id as string,
            performedBy,
            note: "Auto-deducted from F&B sale",
          });
          if (result.error) {
            console.warn("[deductIngredientsForServedItems]", result.error);
          }
        }
      }
    }
  }

  await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ ingredients_deducted_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .in(
      "id",
      pending.map((r) => r.id as string),
    );
}

export async function markFbOrderServed(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  performedBy?: string,
) {
  const order = await loadOrderById(supabase, tenantId, orderId);
  if (!order) return { order: null, error: "Order not found." };
  // A course can be served while later courses are held or still cooking.
  if (!["ready", "sent_to_kitchen"].includes(order.status)) {
    return { order: null, error: "Order is not ready for service." };
  }

  const readyItems = order.items.filter((item) => item.kitchen_status === "ready");
  if (!readyItems.length) {
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

  if (performedBy) {
    await deductIngredientsForServedItems(
      supabase,
      tenantId,
      order.outlet_type,
      readyItems.map((item) => item.id),
      performedBy,
    );
  }

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

  let full = await loadOrderById(supabase, tenantId, orderId);

  // Already paid before the kitchen finished — now that it's fully served,
  // there is nothing left to collect, so close it out automatically.
  if (full && full.settled_at && isOrderFullyServed(full.items)) {
    const { data: closedRow } = await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ status: "closed", closed_at: now, updated_at: now })
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .select("table_id")
      .maybeSingle();
    if (closedRow?.table_id) {
      await markTableDirtyIfFree(supabase, tenantId, closedRow.table_id as string);
    }
    full = await loadOrderById(supabase, tenantId, orderId);
  }

  return { order: full, error: null };
}

export async function updateOrderItemKitchenStatus(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  kitchenStatus: FbKitchenStatus,
) {
  if (kitchenStatus === "voided") {
    const { data: item } = await supabase
      .schema("hotel")
      .from("fb_order_items")
      .select("order_id")
      .eq("id", itemId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (item) {
      const { data: order } = await supabase
        .schema("hotel")
        .from("fb_orders")
        .select("settlement_method,paid_amount")
        .eq("id", item.order_id as string)
        .maybeSingle();
      if (order?.settlement_method || num(order?.paid_amount) > 0) {
        return { item: null, error: "This order has been paid, so its items cannot be voided." };
      }
    }
  }

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
  // Held courses aren't the kitchen's work yet: "ready" means everything fired is ready.
  const items = (itemsByOrder.get(orderId) ?? []).filter((i) => i.fired_at || i.kitchen_status === "voided");
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

/**
 * Closes a settled order once the kitchen has finished it. An order paid
 * before the kitchen finished (pay-first walk-ins) stays on the kitchen board
 * and closes itself when it is marked served (see markFbOrderServed).
 * Settling is done by settleFbOrderAtOutlet / chargeFbOrderToRoom.
 */
export async function closeFbOrder(supabase: SupabaseClient, tenantId: string, orderId: string) {
  const now = new Date().toISOString();

  const current = await loadOrderById(supabase, tenantId, orderId);
  if (!current) return { order: null, error: "Order not found." };
  if (current.status === "voided") return { order: null, error: "Could not close order." };
  if (current.status === "closed") return { order: current, error: null };
  if (!current.settled_at) {
    return { order: null, error: "Take payment or charge it to a room before closing the order." };
  }
  if (!isKitchenWorkComplete(current.items)) return { order: current, error: null };

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

  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ served_at: now })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .is("served_at", null);

  if (data.table_id) {
    await markTableDirtyIfFree(supabase, tenantId, data.table_id as string);
  }

  return { order: mapOrder(data as Record<string, unknown>), error: null };
}

async function tableHasOpenBills(supabase: SupabaseClient, tenantId: string, tableId: string) {
  const { count } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("table_id", tableId)
    .in("status", ["open", "sent_to_kitchen", "ready"]);
  return (count ?? 0) > 0;
}

/** A table only needs clearing once every bill on it is finished. */
async function markTableDirtyIfFree(supabase: SupabaseClient, tenantId: string, tableId: string) {
  if (await tableHasOpenBills(supabase, tenantId, tableId)) return;
  await supabase.schema("hotel").from("fb_tables").update({ status: "dirty" }).eq("id", tableId);
}

export async function voidFbOrder(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  reason?: string,
  voidedBy?: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({
      status: "voided",
      voided_at: now,
      void_reason: reason ?? null,
      voided_by: voidedBy ?? null,
      updated_at: now,
    })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .in("status", ["open", "sent_to_kitchen", "ready"])
    .is("settlement_method", null)
    .eq("paid_amount", 0)
    .select("*")
    .maybeSingle();

  if (!error && !data) {
    const { data: existing } = await supabase
      .schema("hotel")
      .from("fb_orders")
      .select("settlement_method,paid_amount")
      .eq("id", orderId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (existing?.settlement_method || num(existing?.paid_amount) > 0) {
      return { order: null, error: "This order has been paid, so it cannot be cancelled." };
    }
  }

  if (error || !data) return { order: null, error: error?.message ?? "Could not cancel order." };

  await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({ kitchen_status: "voided", updated_at: now })
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId);

  if (data.table_id && !(await tableHasOpenBills(supabase, tenantId, data.table_id as string))) {
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

export async function restockMenuItem(
  supabase: SupabaseClient,
  tenantId: string,
  menuItemId: string,
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_menu_items")
    .update({
      is_available: true,
      eighty_sixed_at: null,
      eighty_sixed_by: null,
      updated_at: now,
    })
    .eq("id", menuItemId)
    .eq("tenant_id", tenantId)
    .select("*")
    .maybeSingle();

  if (error || !data) return { error: error?.message ?? "Could not restore item." };
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

  // The kitchen cooks for the table, not the bill: bills split from one order
  // show as one ticket under the first bill's number.
  const groups = new Map<string, FbOrderWithItems[]>();
  for (const order of orders) {
    const root = order.split_from_order_id ?? order.id;
    groups.set(root, [...(groups.get(root) ?? []), order]);
  }
  const grouped = [...groups.entries()].map(([rootId, bills]) => {
    const first = bills.find((b) => b.id === rootId) ?? [...bills].sort((a, b) => a.bill_number - b.bill_number)[0];
    return {
      ...first,
      id: rootId,
      order_number: first.order_number.replace(/-\d+$/, ""),
      rush: bills.some((b) => b.rush),
      status: bills.every((b) => b.status === "ready") ? first.status : ("sent_to_kitchen" as const),
      category_overdue_minutes: bills.reduce<number | null>(
        (max, b) => (b.category_overdue_minutes != null && (max == null || b.category_overdue_minutes > max) ? b.category_overdue_minutes : max),
        null,
      ),
      items: bills.flatMap((b) => b.items),
    };
  });

  for (const order of grouped) {
    if (isOrderFullyServed(order.items)) continue;

    const activeItems = order.items.filter(
      (i) => i.kitchen_status !== "voided" && i.kitchen_status !== "served",
    );
    if (!activeItems.length) continue;

    const byStation = (list: FbOrderItemRow[]) =>
      stationCode && stationCode !== "all"
        ? list.filter((i) => i.station_code_snapshot === stationCode)
        : list;
    const items = byStation(activeItems.filter((i) => i.fired_at)).sort((a, b) => a.course - b.course);
    const heldItems = byStation(activeItems.filter((i) => !i.fired_at));
    if (!items.length && !heldItems.length) continue;

    const heldByCourse = new Map<number, number>();
    for (const i of heldItems) heldByCourse.set(i.course, (heldByCourse.get(i.course) ?? 0) + 1);

    // Time the ticket from when its current work was fired, not when the order was first sent.
    const firedTimes = items.map((i) => i.fired_at as string).sort();

    const tableLabel =
      order.table_code ?? order.tab_label ?? order.outlet_name ?? "Order";

    tickets.push({
      id: order.id,
      order_number: order.order_number,
      table_label: tableLabel,
      rush: order.rush,
      created_at: order.created_at,
      sent_to_kitchen_at: firedTimes[0] ?? order.sent_to_kitchen_at,
      status: order.status,
      overdue_minutes: order.category_overdue_minutes ?? null,
      held: [...heldByCourse.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([course, count]) => ({ course, label: courseLabel(course), count })),
      items: items.map((i) => ({
        id: i.id,
        name: i.name_snapshot,
        quantity: i.quantity,
        kitchen_status: i.kitchen_status,
        station_code: i.station_code_snapshot,
        menu_item_id: i.menu_item_id,
        modifiers: i.modifiers.map((m) => `${m.group_name}: ${m.option_name}`),
        notes: i.notes,
        course: i.course,
        seat: i.seat,
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

/** Why a settle claim found nothing to update: someone else settled it, or the bill changed. */
async function lostClaimReason(supabase: SupabaseClient, tenantId: string, orderId: string) {
  const latest = await loadOrderById(supabase, tenantId, orderId);
  return (
    (latest && settlementBlockReason(latest)) ??
    "The bill changed while you were settling it. Check the total and try again."
  );
}

/**
 * Takes a payment at the outlet (cash, card or terminal): the whole bill, or a
 * part of it (`amount`), e.g. one share of an even split. The bill is final
 * once the payments add up to it. The money rules live in the SQL function
 * hotel.fb_take_payment, which locks the bill so two tills can't overpay it.
 * Nothing is written to a guest folio: the night audit reads these payments.
 * `reservationId` only links the guest. A tip rides on top of the payment
 * (never part of the bill) and is owed to `tipStaffId`, or the pool when null.
 */
export async function settleFbOrderAtOutlet(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    orderId: string;
    method: FbOutletTender;
    /** Leave out to pay everything that is left. */
    amount?: number | null;
    tendered?: number | null;
    shareLabel?: string | null;
    reservationId?: string | null;
    tip?: number | null;
    tipStaffId?: string | null;
    settledBy: string;
  },
) {
  const order = await loadOrderById(supabase, params.tenantId, params.orderId);
  if (!order) return { order: null, error: "Order not found." };
  const blocked = settlementBlockReason(order);
  if (blocked) return { order: null, error: blocked };

  const left = leftToPay(order);
  const amount = params.amount ?? left;
  const check = resolveTippedPayment({
    left,
    amount,
    method: params.method,
    tendered: params.tendered,
    tip: params.tip,
  });
  if (!check.ok) return { order: null, error: check.error };

  if (params.reservationId && !order.reservation_id) {
    const { data: reservation } = await supabase
      .schema("hotel")
      .from("reservations")
      .select("id")
      .eq("id", params.reservationId)
      .eq("tenant_id", params.tenantId)
      .maybeSingle();
    if (!reservation) return { order: null, error: "Reservation not found." };
    await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ reservation_id: params.reservationId })
      .eq("id", params.orderId)
      .eq("tenant_id", params.tenantId)
      .eq("paid_amount", 0);
  }

  const { data, error } = await supabase.schema("hotel").rpc("fb_take_payment", {
    p_tenant_id: params.tenantId,
    p_order_id: params.orderId,
    p_method: params.method,
    p_amount: amount,
    p_tendered: params.tendered ?? null,
    p_share_label: params.shareLabel ?? null,
    p_taken_by: params.settledBy,
    p_expected_subtotal: order.subtotal,
    p_tip: check.tip,
    p_tip_staff_id: check.tip > 0 ? (params.tipStaffId ?? null) : null,
  });
  if (error) return { order: null, error: error.message };
  const result = data as { payment_id: string; settled: boolean; remaining: number; change_given: number; tip?: number };
  // Counts in the cash-up of the till open at this outlet (if one is open).
  await linkPaymentToOpenTill(supabase, params.tenantId, result.payment_id, order.outlet_id);

  const closed = result.settled ? await closeFbOrder(supabase, params.tenantId, params.orderId) : null;
  return {
    order: closed?.order ?? (await loadOrderById(supabase, params.tenantId, params.orderId)),
    changeGiven: Number(result.change_given) || 0,
    tip: Number(result.tip) || 0,
    remaining: Number(result.remaining) || 0,
    settled: Boolean(result.settled),
    error: null,
  };
}

/**
 * Charges an order to an in-house guest's folio, once. The order is claimed
 * first so a second press (or a payment at the till) can't also settle it;
 * if the folio post fails, the claim is released.
 */
export async function chargeFbOrderToRoom(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    orderId: string;
    reservationId: string;
    postedBy: string;
  },
) {
  const order = await loadOrderById(supabase, params.tenantId, params.orderId);
  if (!order) return { order: null, line: null, error: "Order not found." };
  const blocked = roomChargeBlockReason(order);
  if (blocked) return { order: null, line: null, error: blocked };

  const { data: reservation } = await supabase
    .schema("hotel")
    .from("reservations")
    .select("status")
    .eq("id", params.reservationId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (!reservation) return { order: null, line: null, error: "Reservation not found." };
  if (reservation.status !== "checked_in") {
    return {
      order: null,
      line: null,
      error: "That guest is not currently checked in — cannot charge to room.",
    };
  }

  const { data: claimed, error: claimError } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({
      settlement_method: "room_charge",
      reservation_id: params.reservationId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.orderId)
    .eq("tenant_id", params.tenantId)
    .is("settlement_method", null)
    .eq("paid_amount", 0)
    .neq("status", "voided")
    .eq("subtotal", order.subtotal)
    .select("id")
    .maybeSingle();
  if (claimError) return { order: null, line: null, error: claimError.message };
  if (!claimed) {
    return { order: null, line: null, error: await lostClaimReason(supabase, params.tenantId, params.orderId) };
  }

  const { line, error } = await insertFolioLine(supabase, {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    kind: "charge",
    amount: roundMoney(order.subtotal),
    method: "system",
    description: `F&B order ${order.order_number}`,
    department: "food_beverage",
    postedBy: params.postedBy,
    reference: order.order_number,
  });

  if (error || !line) {
    await supabase
      .schema("hotel")
      .from("fb_orders")
      .update({ settlement_method: null, reservation_id: order.reservation_id })
      .eq("id", params.orderId)
      .eq("tenant_id", params.tenantId)
      .eq("settlement_method", "room_charge")
      .is("settled_at", null);
    return { order: null, line: null, error: error ?? "Could not post to folio." };
  }

  const now = new Date().toISOString();
  await supabase.schema("hotel").from("fb_order_payments").insert({
    tenant_id: params.tenantId,
    order_id: params.orderId,
    method: "room_charge",
    amount: roundMoney(order.subtotal),
    amount_tendered: roundMoney(order.subtotal),
    reservation_id: params.reservationId,
    taken_by: params.postedBy,
    // Shown on the shift report of the till open at this outlet (no cash involved).
    cash_session_id: await openSessionIdForOutlet(supabase, params.tenantId, order.outlet_id),
  });
  await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({
      settled_at: now,
      settled_by: params.postedBy,
      paid_amount: roundMoney(order.subtotal),
      updated_at: now,
    })
    .eq("id", params.orderId)
    .eq("tenant_id", params.tenantId)
    .is("settled_at", null);

  const closed = await closeFbOrder(supabase, params.tenantId, params.orderId);
  return {
    order: closed.order ?? (await loadOrderById(supabase, params.tenantId, params.orderId)),
    line,
    error: null,
  };
}

/**
 * Takes a line off an unpaid bill, with the reason. The route decides whether a
 * manager is needed (see voidNeeds). Paid bills are refused by the database.
 */
export async function voidOrderItem(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  params: { reason: string | null; by: string },
) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({
      kitchen_status: "voided",
      void_reason: params.reason,
      voided_by: params.by,
      voided_at: now,
      updated_at: now,
    })
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .neq("kitchen_status", "voided")
    .select("*")
    .maybeSingle();
  if (error) return { item: null, error: error.message };
  if (!data) return { item: null, error: "That item is already off the bill." };
  const orderId = data.order_id as string;
  await recalcOrderSubtotal(supabase, orderId, tenantId);
  await refreshKitchenStatus(supabase, tenantId, orderId);
  return { item: mapOrderItem(data as Record<string, unknown>), error: null };
}

/** Gives a line free: it stays on the ticket for the kitchen, at no charge. */
export async function compOrderItem(
  supabase: SupabaseClient,
  tenantId: string,
  itemId: string,
  params: { reason: string; by: string },
) {
  const { data: current } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .select("price_snapshot,comped_at,kitchen_status")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!current) return { item: null, error: "Item not found." };
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_order_items")
    .update({
      original_price: num(current.price_snapshot),
      price_snapshot: 0,
      comp_reason: params.reason,
      comped_by: params.by,
      comped_at: now,
      updated_at: now,
    })
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .is("comped_at", null)
    .neq("kitchen_status", "voided")
    .select("*")
    .maybeSingle();
  if (error) return { item: null, error: error.message };
  if (!data) return { item: null, error: "That item is already free or off the bill." };
  await recalcOrderSubtotal(supabase, data.order_id as string, tenantId);
  return { item: mapOrderItem(data as Record<string, unknown>), error: null };
}

/**
 * Moves a party to another table: every open bill of the sitting goes with it.
 * The old table is freed once nothing is open on it.
 */
export async function moveOrderToTable(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  tableId: string,
) {
  const order = await loadOrderById(supabase, tenantId, orderId);
  if (!order) return { order: null, error: "Order not found." };
  if (!["open", "sent_to_kitchen", "ready"].includes(order.status)) {
    return { order: null, error: "Only open bills can move table." };
  }
  if (order.table_id === tableId) return { order: null, error: "The bill is already at that table." };
  const { data: table } = await supabase
    .schema("hotel")
    .from("fb_tables")
    .select("id,table_code")
    .eq("id", tableId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!table) return { order: null, error: "Table not found." };

  const group = await loadBillGroup(supabase, tenantId, order);
  const ids = group.filter((b) => b.table_id === order.table_id).map((b) => b.id);
  const { error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ table_id: tableId, updated_at: new Date().toISOString() })
    .in("id", ids)
    .eq("tenant_id", tenantId);
  if (error) return { order: null, error: error.message };

  await supabase.schema("hotel").from("fb_tables").update({ status: "seated" }).eq("id", tableId);
  if (order.table_id && !(await tableHasOpenBills(supabase, tenantId, order.table_id))) {
    await supabase.schema("hotel").from("fb_tables").update({ status: "available" }).eq("id", order.table_id);
  }
  return { order: await loadOrderById(supabase, tenantId, orderId), moved: ids.length, error: null };
}

/** A manager takes the service charge off one unpaid bill. */
export async function waiveServiceCharge(
  supabase: SupabaseClient,
  tenantId: string,
  orderId: string,
  reason: string,
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_orders")
    .update({ service_charge_percent: 0, service_charge_waived_reason: reason, updated_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", tenantId)
    .is("settlement_method", null)
    .eq("paid_amount", 0)
    .gt("service_charge_percent", 0)
    .select("id")
    .maybeSingle();
  if (error) return { order: null, error: error.message };
  if (!data) return { order: null, error: "There is no service charge to take off, or the bill has been paid." };
  await recalcOrderSubtotal(supabase, orderId, tenantId);
  return { order: await loadOrderById(supabase, tenantId, orderId), error: null };
}
