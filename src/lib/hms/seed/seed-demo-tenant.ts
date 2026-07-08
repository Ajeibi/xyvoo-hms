import type { SupabaseClient } from "@supabase/supabase-js";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { buildDemoSeedPayload } from "./build-demo-data";
import {
  clearDemoTenantData,
  tenantHasDemoData,
  tenantHasNonDemoOperationalData,
} from "./clear-demo-tenant";
import type { DemoTenantContext } from "./demo-schema";

export type SeedDemoResult =
  | { ok: true; skipped: false; message: string }
  | { ok: true; skipped: true; message: string }
  | { ok: false; error: string };

async function insertBatch(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
) {
  if (!rows.length) return;
  const { error } = await supabase.schema("hotel").from(table).upsert(rows, {
    onConflict: "id",
    ignoreDuplicates: false,
  });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function resolveDemoContext(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
): Promise<DemoTenantContext | null> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant || tenant.id !== tenantId) return null;

  const roomTypes = (tenant.room_types ?? []) as { id?: string }[];
  const roomTypeCode = roomTypes[0]?.id;
  if (!roomTypeCode) {
    throw new Error("Tenant has no room types — complete room setup before loading demo data.");
  }

  const { data: roomUnit } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("status", ["vacant_clean", "occupied", "inspected"])
    .order("room_code")
    .limit(1)
    .maybeSingle();

  const pricing = normalizePricingSetup(tenant.pricing_setup);

  return {
    tenantId,
    roomTypeCode,
    roomUnitId: roomUnit?.id ?? null,
    currency: pricing.currency,
  };
}

export async function seedDemoTenant(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
  options?: { force?: boolean },
): Promise<SeedDemoResult> {
  const hasDemo = await tenantHasDemoData(supabase, tenantId);
  if (hasDemo && !options?.force) {
    return { ok: true, skipped: true, message: "Demo data already loaded for this property." };
  }

  const hasReal = await tenantHasNonDemoOperationalData(supabase, tenantId);
  if (hasReal && !options?.force) {
    return {
      ok: false,
      error:
        "Property already has non-demo guests or orders. Use force=true to replace demo data only (real data is untouched).",
    };
  }

  if (options?.force || hasDemo) {
    await clearDemoTenantData(supabase, tenantId);
  }

  const ctx = await resolveDemoContext(supabase, tenantId, slug);
  if (!ctx) return { ok: false, error: "Tenant not found." };

  const payload = buildDemoSeedPayload(ctx);

  await insertBatch(supabase, "guests", payload.guests);
  await insertBatch(supabase, "group_bookings", payload.groupBookings);
  await insertBatch(supabase, "reservations", payload.reservations);
  await insertBatch(supabase, "reservation_guests", payload.reservationGuests);
  await insertBatch(supabase, "folio_transactions", payload.folioTransactions);

  const { error: settingsError } = await supabase
    .schema("hotel")
    .from("tenant_fb_settings")
    .upsert(payload.tenantFbSettings, { onConflict: "tenant_id" });
  if (settingsError) throw new Error(`tenant_fb_settings: ${settingsError.message}`);

  await insertBatch(supabase, "fb_outlets", payload.fbOutlets);
  await insertBatch(supabase, "fb_stations", payload.fbStations);
  await insertBatch(supabase, "fb_menu_categories", payload.fbMenuCategories);
  await insertBatch(supabase, "fb_menu_items", payload.fbMenuItems);
  await insertBatch(supabase, "fb_tables", payload.fbTables);
  await insertBatch(supabase, "fb_orders", payload.fbOrders);
  await insertBatch(supabase, "fb_order_items", payload.fbOrderItems);

  return {
    ok: true,
    skipped: false,
    message: `Demo data loaded: ${payload.guests.length} guests, ${payload.reservations.length} reservations, ${payload.fbOrders.length} F&B orders.`,
  };
}
