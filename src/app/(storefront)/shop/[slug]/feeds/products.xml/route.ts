import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listShopProducts, type ShopProduct } from "@/lib/shop/products";
import { feedItems, productFeedXml } from "@/lib/store/product-feed";
import { getStorefront } from "@/lib/store/site/storefront";

/** Products per database read, and the most a feed carries. */
const PAGE_SIZE = 1000;
const MAX_PRODUCTS = 10_000;

/**
 * The shop's product feed, served at <store>.getxyvoo.com/feeds/products.xml,
 * for Google Merchant Center and Meta Commerce Manager to fetch on a schedule.
 * Only live shops have one, and it lists only what the shop itself shows.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront || !storefront.isLive || storefront.isPreview) return new Response("Not found", { status: 404 });
  const tenantId = storefront.tenant.id;

  const products: ShopProduct[] = [];
  for (let page = 1; products.length < MAX_PRODUCTS; page++) {
    const result = await listShopProducts(tenantId, { page, pageSize: PAGE_SIZE });
    products.push(...result.products);
    if (result.products.length < PAGE_SIZE) break;
  }

  // The gift card is bought on the shop, not advertised as a product.
  const { data: profile } = await createServerSupabaseClient()
    .schema("store")
    .from("business_profile")
    .select("gift_card_product_id")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const giftCardId = (profile?.gift_card_product_id as string | null) ?? null;

  const shop = { siteUrl: storefront.siteUrl, storeName: storefront.storeName };
  const xml = productFeedXml(
    feedItems(
      products.filter((p) => p.id !== giftCardId),
      shop,
    ),
    { ...shop, description: storefront.site.seo.description || `Products from ${storefront.storeName}.` },
  );

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
