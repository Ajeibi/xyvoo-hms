import { notFound } from "next/navigation";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { getShopProductBySlug } from "@/lib/shop/products";
import ProductDetailClient from "@/components/shop/ProductDetailClient";

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;

  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) notFound();

  const product = await getShopProductBySlug(tenant.id, productSlug);
  if (!product) notFound();

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <ProductDetailClient product={product} />
    </div>
  );
}
