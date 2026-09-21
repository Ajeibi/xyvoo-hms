import { notFound } from "next/navigation";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import ShopLayoutShell from "@/components/shop/ShopLayoutShell";

export default async function ShopSlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);

  if (!tenant) notFound();

  const storeDisplayName = tenant.displayName?.trim() || tenant.name?.trim() || slug;

  return (
    <ShopLayoutShell slug={slug} storeDisplayName={storeDisplayName} logoUrl={tenant.logoUrl}>
      {children}
    </ShopLayoutShell>
  );
}
