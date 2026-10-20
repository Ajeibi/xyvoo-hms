import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StoreCheckout, { type CheckoutDeliveryOption } from "@/components/storefront-theme/StoreCheckout";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapDeliveryZone, type DeliveryZoneRow } from "@/lib/store/delivery";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getCheckoutFreeRules } from "@/lib/store/free-delivery-server";
import { getTaxSettings } from "@/lib/store/tax-server";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function StorefrontCheckoutPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pay?: string | string[] }> }) {
  const { pay } = await searchParams;
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const { basePath, pages } = storefront;
  const pageHref = (key: string) => {
    const page = pages.find((p) => p.systemKey === key);
    return page ? storeHref(basePath, STORE_PATHS.page(page.slug)) : null;
  };

  const [{ data: zoneRows }, freeRules, tax] = await Promise.all([
    createServerSupabaseClient()
      .schema("store")
      .from("delivery_zones")
      .select("id, name, regions, fee, weight_bands, free_over, eta_text, is_pickup, is_active, sort_order")
      .eq("tenant_id", storefront.tenant.id)
      .eq("is_active", true)
      .order("sort_order"),
    getCheckoutFreeRules(storefront.tenant.id),
    getTaxSettings(storefront.tenant.id),
  ]);
  const deliveryOptions: CheckoutDeliveryOption[] = ((zoneRows || []) as DeliveryZoneRow[]).map(mapDeliveryZone).map((z) => ({
    id: z.id,
    name: z.name,
    fee: z.fee,
    freeOver: z.freeOver,
    etaText: z.etaText,
    isPickup: z.isPickup,
    regions: z.regions,
    weightBands: z.weightBands,
  }));

  return (
    <div className="container section">
      <h1 className="h-page">Checkout</h1>
      <ol className="progress-steps" aria-label="Checkout progress">
        <li>
          <Link href={storeHref(basePath, STORE_PATHS.cart)}>Basket</Link>
        </li>
        <li aria-current="step">Details and payment</li>
        <li>Confirmation</li>
      </ol>
      {storefront.paymentMethods.length ? (
        <StoreCheckout
          countryCode={storefront.profile.countryCode}
          storeName={storefront.storeName}
          termsHref={pageHref("terms")}
          privacyHref={pageHref("privacy")}
          deliveryOptions={deliveryOptions}
          freeRules={freeRules}
          tax={{ enabled: tax.enabled, name: tax.name, rate: tax.rate, inclusive: tax.inclusive, onDelivery: tax.onDelivery }}
          paymentMethods={storefront.paymentMethods}
          initialPaymentMethod={storefront.paymentMethods.find((m) => m === pay)}
          offerWhatsAppUpdates={storeHasFeature(await getStorePlan(storefront.tenant.id), "whatsappMessages")}
        />
      ) : (
        <div className="cart-empty">
          <h2 className="h-section">Ordering isn&rsquo;t open yet</h2>
          <p className="body-copy">This shop isn&rsquo;t taking orders online at the moment. Please contact the shop to place your order.</p>
        </div>
      )}
    </div>
  );
}
