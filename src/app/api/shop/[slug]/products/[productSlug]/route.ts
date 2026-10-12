import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { getShopProductBySlug } from "@/lib/shop/products";
import { isShopLive } from "@/lib/store/site/data";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export async function GET(req: Request, { params }: { params: Promise<{ slug: string; productSlug: string }> }) {
  if (!rateLimit(`shop-products:${clientIp(req)}`, 120, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests. Please slow down." }, { status: 429 });
  }
  const { slug, productSlug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant || !(await isShopLive(tenant.id))) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });

  try {
    const product = await getShopProductBySlug(tenant.id, productSlug.slice(0, 200));
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ product });
  } catch (err) {
    console.error("[shop products] product failed", err);
    return NextResponse.json({ error: "We couldn't load this product just now." }, { status: 500 });
  }
}
