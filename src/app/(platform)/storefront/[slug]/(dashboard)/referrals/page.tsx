import type { Metadata } from "next";
import ReferralsManager from "@/components/storefront/ReferralsManager";
import { DashPageHeader } from "@/components/storefront/dashboard-blocks";
import { requireStoreSection } from "@/lib/store/access";

export const metadata: Metadata = { title: "Referrals" };

export default async function StorefrontReferralsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  await requireStoreSection(slug, "referrals");
  return (
    <div className="space-y-6">
      <DashPageHeader title="Referrals" description="Customers tell their friends. Their friends get money off, and they get a reward." />
      <ReferralsManager slug={slug} />
    </div>
  );
}
