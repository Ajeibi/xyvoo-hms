import type { Metadata } from "next";
import AnalyticsDashboard from "@/components/storefront/AnalyticsDashboard";

export const metadata: Metadata = { title: "Analytics" };

export default async function StorefrontAnalyticsDashboardPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Analytics</h1>
        <p className="mt-1 text-sm text-slate-500">What&rsquo;s happening in your shop: visitors, sales, and where people drop off.</p>
      </div>
      <AnalyticsDashboard slug={slug} />
    </div>
  );
}
