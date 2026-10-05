import StorefrontProducts from "@/components/storefront/StorefrontProducts";
import { getStoreAccessContext, getStoreCapabilities } from "@/lib/store/access";

export default async function StorefrontProductsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const access = await getStoreAccessContext(slug);
  const capabilities = getStoreCapabilities(access.role);
  return <StorefrontProducts slug={slug} capabilities={capabilities} />;
}
