import type { Metadata } from "next";
import CampaignsManager from "@/components/storefront/CampaignsManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Email campaigns" };

export default async function StorefrontCampaignsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "campaigns");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Email campaigns" description="Write an email once and send it to the customers who agreed to hear from you." />
      <CampaignsManager slug={slug} />
    </div>
  );
}
