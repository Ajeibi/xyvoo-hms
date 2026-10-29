import { NextResponse } from "next/server";
import { mapDeliveryZone, type DeliveryZoneRow } from "@/lib/store/delivery";
import { getCheckoutFreeRules } from "@/lib/store/free-delivery-server";
import { getCachedShopTenant } from "@/lib/store/site/shop-cache";
import { isShopLive } from "@/lib/store/site/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { shopperT } from "@/lib/store/i18n/shopper";

/**
 * GET /api/shop/<store>/delivery-summary — what the basket says about delivery
 * before the shopper gives an address: the lowest delivery charge, whether
 * collection is offered, and the smallest order that delivers free anywhere
 * (for "spend X more for free delivery"). Checkout works the real charge out.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getCachedShopTenant(slug) : null;
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  if (!(await isShopLive(tenant.id))) return NextResponse.json({ error: (await shopperT(req, slug, tenant.id))("errors.coShopNotFound") }, { status: 404 });

  const [{ data }, rules] = await Promise.all([
    createServerSupabaseClient()
      .schema("store")
      .from("delivery_zones")
      .select("id, name, regions, fee, weight_bands, free_over, eta_text, is_pickup, is_active, sort_order")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true),
    getCheckoutFreeRules(tenant.id).catch(() => []),
  ]);
  const zones = ((data || []) as DeliveryZoneRow[]).map(mapDeliveryZone);
  const delivered = zones.filter((z) => !z.isPickup);
  const cheapest = delivered.sort((a, b) => a.fee - b.fee)[0] ?? null;
  // Free over an amount everywhere: a zone's own threshold only counts when every zone has one;
  // a rule counts when it has no area or product condition.
  const zoneThresholds = delivered.map((z) => z.freeOver);
  const everyZoneFree = delivered.length > 0 && zoneThresholds.every((t) => t != null) ? Math.max(...(zoneThresholds as number[])) : null;
  const ruleThresholds = rules.filter((r) => !r.areas.length && !r.hasProductCondition && !r.minItems && r.minSubtotal != null).map((r) => r.minSubtotal as number);
  const freeOver = [everyZoneFree, ...ruleThresholds].filter((t): t is number => t != null).sort((a, b) => a - b)[0] ?? null;

  return NextResponse.json(
    {
      deliveryFrom: cheapest ? cheapest.fee : null,
      eta: cheapest?.etaText ?? null,
      pickup: zones.some((z) => z.isPickup),
      freeOver,
    },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } },
  );
}
