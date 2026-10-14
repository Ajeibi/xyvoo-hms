import type { Metadata } from "next";
import TradeManager from "@/components/storefront/TradeManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Trade accounts" };

export default async function StorefrontTradePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "trade");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Trade accounts" description="Sell to other businesses at trade prices. They apply, you approve, and only they see the trade price." />
      <TradeManager slug={slug} />
    </div>
  );
}
