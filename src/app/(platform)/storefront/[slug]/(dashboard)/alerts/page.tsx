import type { Metadata } from "next";
import { AlertPreferencesCard, DeviceAlertsCard } from "@/components/storefront/OrderAlertsCard";
import WhatsAppMessagesCard from "@/components/storefront/WhatsAppMessagesCard";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { DashSectionIntro } from "@/components/storefront/dashboard-ui";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Order alerts" };

export default async function StorefrontAlertsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "alerts");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Order alerts" description="Hear about new orders, low stock and payment problems straight away, by email, on your phone and on WhatsApp." />

      <DashSectionIntro
        id="alerts"
        meaning="orders"
        art="bell"
        title="Stay notified on every incoming order"
        points={[
          "Enable instant browser push notifications to get alerted the second a customer places an order.",
          "Customise automated email summaries for low inventory warnings, failed transactions, and weekly sales digests.",
          "Alerts keep your kitchen, packaging, and fulfillment team moving without delays.",
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <DeviceAlertsCard slug={slug} />
        <AlertPreferencesCard slug={slug} />
      </div>
      <WhatsAppMessagesCard slug={slug} />
    </div>
  );
}
