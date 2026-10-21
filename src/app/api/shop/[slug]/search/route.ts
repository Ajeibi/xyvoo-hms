import { NextResponse } from "next/server";
import { matchScore, normalise } from "@/lib/shop/catalogue-filter";
import { getShopCatalogue } from "@/lib/shop/catalogue-index";
import { getCachedShopTenant } from "@/lib/store/site/shop-cache";
import { isShopLive } from "@/lib/store/site/data";

/** How many products and categories the suggestions under the search box show. */
const PRODUCTS = 6;
const CATEGORIES = 3;

/**
 * Suggestions as a shopper types in the shop's search box: the best-matching
 * products (with photo and price) and categories. The same matching as the
 * search results page, so a suggestion is never missing from the results.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const q = (new URL(req.url).searchParams.get("q") || "").trim().slice(0, 100);
  if (!/^[a-z0-9-]{1,63}$/i.test(slug) || q.length < 2) return NextResponse.json({ products: [], categories: [] });

  const tenant = await getCachedShopTenant(slug);
  if (!tenant || !(await isShopLive(tenant.id))) return NextResponse.json({ products: [], categories: [] }, { status: 404 });

  const catalogue = await getShopCatalogue(tenant.id);
  const products = catalogue
    .map((p) => ({ p, score: matchScore(p, q) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, PRODUCTS)
    .map(({ p }) => ({ id: p.id, name: p.name, slug: p.slug || p.id, imageUrl: p.imageUrl, price: p.price, compareAt: p.compareAtPrice, fixedPrices: p.fixedPrices, inStock: p.inStock }));

  const wanted = normalise(q);
  const categories = [...new Set(catalogue.map((p) => p.category).filter((c): c is string => Boolean(c)))]
    .filter((c) => normalise(c).includes(wanted))
    .slice(0, CATEGORIES);

  // Shared caches can keep this briefly; it's the same for every shopper.
  return NextResponse.json({ products, categories }, { headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
}
