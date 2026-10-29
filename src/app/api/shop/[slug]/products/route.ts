import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { listShopProducts } from "@/lib/shop/products";
import { isShopLive } from "@/lib/store/site/data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { shopperT } from "@/lib/store/i18n/shopper";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!rateLimit(`shop-products:${clientIp(req)}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  // An unpublished shop's catalogue isn't public yet.
  if (!tenant) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);
  if (!(await isShopLive(tenant.id))) return NextResponse.json({ error: t("errors.coStorefrontNotFound") }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category")?.slice(0, 100) || undefined;
  const search = searchParams.get("search")?.slice(0, 100) || undefined;
  const page = Math.min(Math.max(Number(searchParams.get("page")) || 1, 1), 500);

  try {
    const result = await listShopProducts(tenant.id, { category, search, page });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[shop products] list failed", err);
    return NextResponse.json({ error: t("errors.coProductsLoadFailed") }, { status: 500 });
  }
}
