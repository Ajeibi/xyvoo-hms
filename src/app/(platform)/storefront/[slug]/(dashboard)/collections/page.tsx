import type { Metadata } from "next";
import CollectionsManager from "@/components/storefront/CollectionsManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";

export const metadata: Metadata = {
  title: "Collections",
};

export default async function StorefrontCollectionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="space-y-6">
      <DashPageHeader
        title="Collections"
        description={<>Group products so customers can browse them together, like &ldquo;New in&rdquo;, &ldquo;Summer Sale&rdquo;, or &ldquo;Gift ideas&rdquo;.</>}
      />
      <DashSectionIntro
        id="collections"
        meaning="stock"
        art="box"
        title="Organise your products into collections"
        points={[
          "Collections create dedicated landing pages on your storefront for themed product categories.",
          "Add cover imagery and custom descriptions to highlight special product drops or promotional seasons.",
          "Feature collections directly on your homepage using the Website Editor.",
        ]}
      />
      <CollectionsManager slug={slug} />
    </div>
  );
}
