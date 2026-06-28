import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadFbConfig, loadMenuForAdmin, loadPublicMenu, loadStations } from "@/lib/hms/fb-menu";
import { loadKitchenBoard, loadKitchenHistory, loadOrders } from "@/lib/hms/fb-orders";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  FbKitchenTicket,
  FbMenuCategoryRow,
  FbMenuItemRow,
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

export type KitchenHistoryRow = {
  id: string;
  order_number: string;
  table_label: string;
  status: string;
  closed_at: string | null;
  voided_at: string | null;
  item_count: number;
  created_at: string;
  sent_to_kitchen_at: string | null;
};

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

export function mapKitchenHistoryRows(orders: FbOrderWithItems[]): KitchenHistoryRow[] {
  return orders.map((o) => ({
    id: o.id,
    order_number: o.order_number,
    table_label: o.table_code ?? o.tab_label ?? o.outlet_name ?? "—",
    status: o.status,
    closed_at: o.closed_at,
    voided_at: o.voided_at,
    item_count: o.items.length,
    created_at: o.created_at,
    sent_to_kitchen_at: o.sent_to_kitchen_at,
  }));
}

export function filterRestaurantTables(config: FbConfigPayload): FbTableRow[] {
  const restaurant = config.outlets.find((o) => o.outlet_type === "restaurant");
  return config.tables.filter((t) => !restaurant || t.outlet_id === restaurant.id);
}

export async function loadFbPosPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const [config, orders] = await Promise.all([
    loadFbConfig(ctx.service, ctx.tenant.id),
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

  return {
    slug,
    tenantId: ctx.tenant.id,
    initial: {
      tables: filterRestaurantTables(config),
      orders,
    },
  };
}

export async function loadFbOrdersPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const orders = await loadOrders(ctx.service, ctx.tenant.id);

  return {
    slug,
    tenantId: ctx.tenant.id,
    currency: ctx.currency,
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

  const [tickets, { stations }] = await Promise.all([
    loadKitchenBoard(ctx.service, ctx.tenant.id, "all"),
    loadStations(ctx.service, ctx.tenant.id),
  ]);

  return {
    slug,
    tenantId: ctx.tenant.id,
    initial: { tickets, stations },
  };
}

export async function loadKitchenHistoryPageModel(slug: string) {
  const ctx = await fbServerContext(slug);
  if (!ctx) return null;

  const orders = await loadKitchenHistory(ctx.service, ctx.tenant.id);

  return {
    slug,
    tenantId: ctx.tenant.id,
    initial: { rows: mapKitchenHistoryRows(orders) },
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
