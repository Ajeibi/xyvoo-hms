import type { Metadata } from "next";
import NotificationsManager from "@/components/storefront/NotificationsManager";
import UpgradePrompt from "@/components/storefront/UpgradePrompt";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";

export const metadata: Metadata = { title: "Notifications" };

export default async function StorefrontNotificationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await requireStoreSection(slug, "notifications");
  const available = storeHasFeature(await getStorePlan(access.tenantId), "pushNotifications");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Notifications" description="Send a short message that pops up on your customers’ phones, like a notification from any app." />
      {available ? (
        <NotificationsManager slug={slug} storeName={access.storeDisplayName} />
      ) : (
        <UpgradePrompt
          slug={slug}
          title="Send notifications to your customers’ phones"
          description="Tell customers about new stock, sales and offers with a message that pops up on their phone, like any app. Customers who allowed notifications are kept, so you can reach them as soon as you upgrade."
        />
      )}
    </div>
  );
}
