import type { Metadata } from "next";
import AbandonedCarts from "@/components/storefront/AbandonedCarts";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Abandoned carts" };

export default async function StorefrontAbandonedCartsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "abandoned-carts");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Abandoned carts" description="Shoppers who started checkout but didn’t pay. A friendly message often turns them into a sale." />
      <AbandonedCarts slug={slug} />
    </div>
  );
}
