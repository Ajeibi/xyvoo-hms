import type { Metadata } from "next";
import GiftCardsManager from "@/components/storefront/GiftCardsManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Gift cards" };

export default async function StorefrontGiftCardsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "gift-cards");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Gift cards" description="Sell gift cards in your shop, send one yourself, and see what's left on every card." />
      <GiftCardsManager slug={slug} />
    </div>
  );
}
