import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";
import {
  loadFbCategoryPrepTimes,
  loadFbConfig,
  loadMenuForAdmin,
  loadPublicMenu,
  loadStations,
} from "@/lib/hms/fb-menu";
import {
  kitchenTicketHistoryAt,
  kitchenTicketTimingEnd,
  loadFbOrderHistory,
  loadKitchenBoard,
  loadKitchenOrderHistory,
  loadOrders,
} from "@/lib/hms/fb-orders";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  FbKitchenTicket,
  FbMenuCategoryRow,
  FbMenuItemRow,
  FbOrderSettlementMethod,
  FbOrderWithItems,
  FbOutletRow,
  FbStationRow,
  FbTableRow,
} from "@/lib/hms/fb-types";
import type { PublicMenuOutlet } from "@/lib/hms/fb-menu";

export type FbConfigPayload = {
  outlets: FbOutletRow[];
  stations: FbStationRow[];
  categories: FbMenuCategoryRow[];
  items: FbMenuItemRow[];
  tables: FbTableRow[];
};

export type FbOrderHistoryRow = {
  id: string;
  order_number: string;
  table_label: string;
  status: string;
  closed_at: string | null;
  voided_at: string | null;
  settlement_method: FbOrderSettlementMethod | null;
  item_count: number;
  created_at: string;
  sent_to_kitchen_at: string | null;
  subtotal: number;
  /** End of kitchen prep (for timing); set on kitchen history rows. */
  kitchen_end_at: string | null;
  /** When the ticket left the kitchen board (for date filters/display). */
  history_at: string | null;
  /** Per-category cook-time target for this ticket. null = use the global threshold. */
  overdue_minutes: number | null;
  /** When the kitchen marked the ticket ready — start of the F&B service window. */
  kitchen_ready_at: string | null;
  /** When F&B marked it served — end of the F&B service window. */
  served_at: string | null;
};

/** @deprecated Use FbOrderHistoryRow */
export type KitchenHistoryRow = FbOrderHistoryRow;

export type PublicMenuPagePayload = {
  hotel: { name: string; logoUrl: string | null; currency: string };
  outlets: PublicMenuOutlet[];
};

async function fbServerContext(slug: string) {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return null;
  return {
    tenant,
    service: createServerSupabaseClient(),
    currency: normalizePricingSetup(tenant.pricing_setup).currency,
  };
}

export function mapFbOrderHistoryRows(orders: FbOrderWithItems[]): FbOrderHistoryRow[] {
  return orders.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    table_label: o.table_code ?? o.tab_label ?? o.outlet_name ?? "—",
    status: o.status,
    closed_at: o.closed_at,
    voided_at: o.voided_at,
    settlement_method: o.settlement_method,
    item_count: o.items.length,
    created_at: o.created_at,
    sent_to_kitchen_at: o.sent_to_kitchen_at,
    subtotal: o.subtotal,
    kitchen_end_at: kitchenTicketTimingEnd(o),
    history_at: kitchenTicketHistoryAt(o).toISOString(),
    overdue_minutes: o.category_overdue_minutes ?? null,
    kitchen_ready_at: o.kitchen_ready_at,
    served_at: o.served_at,
  }));
}

/** Kitchen and restaurant history share the same row shape. */
export const mapKitchenOrderHistoryRows = mapFbOrderHistoryRows;

/** @deprecated Use mapKitchenOrderHistoryRows */
export const mapKitchenHistoryRows = mapFbOrderHistoryRows;

export function filterRestaurantTables(config: FbConfigPayload): FbTableRow[] {
  const restaurant = config.outlets.find((o) => o.outlet_type === "restaurant");
  return config.tables.filter((t) => !restaurant || t.outlet_id === restaurant.id);
}

export async function loadFbPosPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [config, orders] = await Promise.all([
    loadFbConfig(ctx.service, ctx.tenant.id, { seedDefaults: false }),
    loadOrders(ctx.service, ctx.tenant.id),
  ]);

  return {
    slug,
    tenantId: ctx.tenant.id,
    currency: ctx.currency,
    initial: { config, orders },
  };
}

export async function loadFbTablesPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [config, orders] = await Promise.all([
    loadFbConfig(ctx.service, ctx.tenant.id, { seedDefaults: false }),
    loadOrders(ctx.service, ctx.tenant.id),
  ]);

  const restaurant = config.outlets.find((o) => o.outlet_type === "restaurant");

  return {
    slug,
    tenantId: ctx.tenant.id,
    outletId: restaurant?.id ?? config.outlets[0]?.id ?? null,
    initial: {
      tables: filterRestaurantTables(config),
      orders,
    },
  };
}

export async function loadFbOrdersPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [orders, fbSettings] = await Promise.all([
    loadOrders(ctx.service, ctx.tenant.id, {
      status: ["open", "sent_to_kitchen", "ready"],
    }),
    getTenantFbSettings(ctx.service, ctx.tenant.id),
  ]);

  return {
    slug,
    tenantId: ctx.tenant.id,
    currency: ctx.currency,
    kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
    initial: { orders },
  };
}

export async function loadFbSettingsPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const config = await loadFbConfig(ctx.service, ctx.tenant.id, { seedDefaults: false });

  return {
    slug,
    tenantId: ctx.tenant.id,
    initial: {
      outlets: config.outlets,
      stations: config.stations,
      tables: config.tables,
    },
  };
}

export async function loadKitchenKdsPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [tickets, { stations }, fbSettings] = await Promise.all([
    loadKitchenBoard(ctx.service, ctx.tenant.id, "all"),
    loadStations(ctx.service, ctx.tenant.id),
    getTenantFbSettings(ctx.service, ctx.tenant.id),
  ]);

  return {
    slug,
    tenantId: ctx.tenant.id,
    kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
    kitchenOverdueMinutesConfigured: fbSettings.kitchenOverdueMinutesConfigured,
    initial: { tickets, stations },
  };
}

export async function loadKitchenMenuPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const config = await loadFbConfig(ctx.service, ctx.tenant.id, { seedDefaults: false });

  return {
    slug,
    tenantId: ctx.tenant.id,
    initial: { config },
  };
}

export async function loadKitchenSettingsPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [fbSettings, categories] = await Promise.all([
    getTenantFbSettings(ctx.service, ctx.tenant.id),
    loadFbCategoryPrepTimes(ctx.service, ctx.tenant.id),
  ]);

  return {
    slug,
    tenantId: ctx.tenant.id,
    initial: fbSettings,
    categories,
  };
}

export async function loadKitchenHistoryPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [orders, fbSettings] = await Promise.all([
    loadKitchenOrderHistory(ctx.service, ctx.tenant.id, "all"),
    getTenantFbSettings(ctx.service, ctx.tenant.id),
  ]);

  return {
    slug,
    tenantId: ctx.tenant.id,
    currency: ctx.currency,
    kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
    initial: { rows: mapKitchenOrderHistoryRows(orders) },
  };
}

export async function loadFbOrderHistoryPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [orders, fbSettings] = await Promise.all([
    loadFbOrderHistory(ctx.service, ctx.tenant.id, "all"),
    getTenantFbSettings(ctx.service, ctx.tenant.id),
  ]);

  return {
    slug,
    tenantId: ctx.tenant.id,
    currency: ctx.currency,
    kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
    initial: { rows: mapFbOrderHistoryRows(orders) },
  };
}

export async function loadHotelMenuSetupModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const menu = await loadMenuForAdmin(ctx.service, ctx.tenant.id);

  return {
    slug,
    currency: ctx.currency,
    initial: menu,
  };
}

export async function loadPublicMenuPageModel(slug: string): Promise<PublicMenuPagePayload | null> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return null;

  const service = createServerSupabaseClient();
  const outlets = await loadPublicMenu(service, tenant.id);
  const pricing = normalizePricingSetup(tenant.pricing_setup);

  return {
    hotel: {
      name: tenant.display_name?.trim() || tenant.name?.trim() || slug,
      logoUrl: tenant.logo_url ?? null,
      currency: pricing.currency,
    },
    outlets,
  };
}

export function filterKitchenTicketsByStation(
  tickets: FbKitchenTicket[],
  stationCode: string,
): FbKitchenTicket[] {
  if (stationCode === "all") return tickets;
  return tickets
    .map((ticket) => ({
      ...ticket,
      items: ticket.items.filter((item) => item.station_code === stationCode),
    }))
    .filter((ticket) => ticket.items.length > 0);
}
