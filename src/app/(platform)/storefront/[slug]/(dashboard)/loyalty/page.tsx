import type { Metadata } from "next";
import LoyaltyManager from "@/components/storefront/LoyaltyManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Loyalty points" };

export default async function StorefrontLoyaltyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "loyalty");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Loyalty points" description="Reward customers who come back: they earn points on what they spend and use them for money off." />
      <LoyaltyManager slug={slug} />
    </div>
  );
}
