import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import StoreCheckout, { type CheckoutDeliveryOption } from "@/components/storefront-theme/StoreCheckout";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { mapDeliveryZone, type DeliveryZoneRow } from "@/lib/store/delivery";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default async function StorefrontCheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const { basePath, pages } = storefront;
  const pageHref = (key: string) => {
    const page = pages.find((p) => p.systemKey === key);
    return page ? storeHref(basePath, STORE_PATHS.page(page.slug)) : null;
  };

  const { data: zoneRows } = await createServerSupabaseClient()
    .schema("store")
    .from("delivery_zones")
    .select("id, name, regions, fee, free_over, eta_text, is_pickup, is_active, sort_order")
    .eq("tenant_id", storefront.tenant.id)
    .eq("is_active", true)
    .order("sort_order");
  const deliveryOptions: CheckoutDeliveryOption[] = ((zoneRows || []) as DeliveryZoneRow[]).map(mapDeliveryZone).map((z) => ({
    id: z.id,
    name: z.name,
    fee: z.fee,
    freeOver: z.freeOver,
    etaText: z.etaText,
    isPickup: z.isPickup,
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
      {storefront.acceptsPayments ? (
        <StoreCheckout
          countryCode={storefront.profile.countryCode}
          termsHref={pageHref("terms")}
          privacyHref={pageHref("privacy")}
          deliveryOptions={deliveryOptions}
        />
      ) : (
        <div className="cart-empty">
          <h2 className="h-section">Online payment isn&rsquo;t available yet</h2>
          <p className="body-copy">This shop isn&rsquo;t taking card payments online at the moment. Please contact the shop to place your order.</p>
        </div>
      )}
    </div>
  );
}
