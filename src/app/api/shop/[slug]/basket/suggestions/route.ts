import { NextResponse } from "next/server";
import { getShopCatalogue } from "@/lib/shop/catalogue-index";
import { getCachedShopTenant } from "@/lib/store/site/shop-cache";
import { isShopLive } from "@/lib/store/site/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** How many products "You might also like" shows. */
const COUNT = 4;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * GET /api/shop/<store>/basket/suggestions?ids=<product ids> — "You might also
 * like" for the basket: the merchant's own pairings for what's in it first
 * (cross-sells), then other products from the same categories, then best
 * sellers. Never something already in the basket, and only things in stock.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ids = (new URL(req.url).searchParams.get("ids") || "").split(",").filter((id) => UUID.test(id)).slice(0, 50);
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getCachedShopTenant(slug) : null;
  if (!tenant || !(await isShopLive(tenant.id))) return NextResponse.json({ products: [] }, { status: 404 });

  const [catalogue, { data: pairs }] = await Promise.all([
    getShopCatalogue(tenant.id),
    ids.length
      ? createServerSupabaseClient().schema("store").from("product_cross_sells").select("related_product_id").in("product_id", ids)
      : Promise.resolve({ data: [] as { related_product_id: string }[] }),
  ]);
  const inBasket = new Set(ids);
  const byId = new Map(catalogue.map((p) => [p.id, p]));
  const categories = new Set(ids.map((id) => byId.get(id)?.category).filter(Boolean));
  const picked: string[] = [];
  const offer = (id: string) => {
    const p = byId.get(id);
    if (p && p.inStock && !inBasket.has(id) && !picked.includes(id) && picked.length < COUNT) picked.push(id);
  };
  for (const pair of pairs || []) offer(pair.related_product_id as string);
  for (const p of catalogue) if (categories.has(p.category)) offer(p.id);
  for (const p of catalogue) if (p.bestSeller || p.featured) offer(p.id);

  const products = picked.map((id) => {
    const p = byId.get(id)!;
    // Products with options are chosen on their own page; the rest can be added from here.
    return {
      id: p.id,
      name: p.name,
      slug: p.slug || p.id,
      imageUrl: p.imageUrl,
      imageAlt: p.imageAltTexts[0] || "",
      price: p.price,
      compareAt: p.compareAtPrice,
      fixedPrices: p.fixedPrices,
      currency: p.currency,
      needsOptions: p.productOptions.length > 0 && p.variants.length > 0,
      stock: p.stock,
      allowBackorder: p.allowBackorder,
      minimumOrderQty: p.minimumOrderQty,
      deliveryExtra: p.deliveryExtra,
    };
  });
  return NextResponse.json({ products }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=60" } });
}
