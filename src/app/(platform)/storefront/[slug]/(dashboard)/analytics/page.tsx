import type { Metadata } from "next";
import AnalyticsDashboard from "@/components/storefront/AnalyticsDashboard";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Analytics" };

export default async function StorefrontAnalyticsDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "analytics");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Analytics" description="How your shop is doing: who visits, what sells, and where shoppers stop before buying." />
      <AnalyticsDashboard slug={slug} />
    </div>
  );
}
