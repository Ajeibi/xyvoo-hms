import type { Metadata } from "next";
import ActivityLog from "@/components/storefront/ActivityLog";
import UpgradePrompt from "@/components/storefront/UpgradePrompt";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";
import { requireStoreSection } from "@/lib/store/access";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";

export const metadata: Metadata = { title: "Activity" };

export default async function StorefrontActivityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "activity");
  const available = storeHasFeature(await getStorePlan(access.tenantId), "activityLog");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Activity" description="Who changed what in your dashboard, and when: prices, products, settings, payouts, discounts and the team." />

      <DashSectionIntro
        id="activity"
        meaning="neutral"
        art="chart"
        title="Audit trail and activity log"
        points={[
          "Track key actions taken across your store: price edits, product creations, inventory updates, and payout modifications.",
          "Clear audit history ensures team accountability and transparency.",
        ]}
      />

      {available ? (
        <ActivityLog slug={slug} />
      ) : (
        <UpgradePrompt
          slug={slug}
          title="See who changed what"
          description="The activity log shows every change to prices, products, settings, payouts, discounts and the team, with who made it and when. For example: “Ada changed the price of Linen Shirt from ₦10,000 to ₦12,000 · 2 hours ago”."
        />
      )}
    </div>
  );
}
