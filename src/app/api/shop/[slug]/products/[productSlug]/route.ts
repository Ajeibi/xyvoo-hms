import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { getShopProductBySlug } from "@/lib/shop/products";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; productSlug: string }> },
) {
  const { slug, productSlug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });

  try {
    const product = await getShopProductBySlug(tenant.id, productSlug);
    if (!product) return NextResponse.json({ error: "Product not found." }, { status: 404 });
    return NextResponse.json({ product });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to load product." }, { status: 400 });
  }
}
