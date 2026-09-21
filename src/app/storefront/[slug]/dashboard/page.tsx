import StorefrontOverview from "@/components/storefront/StorefrontOverview";

export default async function StorefrontDashboardPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StorefrontOverview slug={slug} />;
}
