import StorefrontOrders from "@/components/storefront/StorefrontOrders";

export default async function StorefrontOrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StorefrontOrders slug={slug} />;
}
