import StorefrontSettingsClient from "@/components/storefront/StorefrontSettingsClient";

export default async function StorefrontSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <StorefrontSettingsClient slug={slug} />;
}
