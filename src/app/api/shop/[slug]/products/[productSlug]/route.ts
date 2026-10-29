import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { getShopProductBySlug } from "@/lib/shop/products";
import { isShopLive } from "@/lib/store/site/data";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { shopperT } from "@/lib/store/i18n/shopper";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; productSlug: string }> }) {
  if (!rateLimit(`shop-products:${clientIp(req)}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  const { slug, productSlug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);
  if (!(await isShopLive(tenant.id))) return NextResponse.json({ error: t("errors.coStorefrontNotFound") }, { status: 404 });

  try {
    const product = await getShopProductBySlug(tenant.id, productSlug.slice(0, 200));
    if (!product) return NextResponse.json({ error: t("errors.coProductNotFound") }, { status: 404 });
    return NextResponse.json({ product });
  } catch (err) {
    console.error("[shop products] product failed", err);
    return NextResponse.json({ error: t("errors.coProductLoadFailed") }, { status: 500 });
  }
}
