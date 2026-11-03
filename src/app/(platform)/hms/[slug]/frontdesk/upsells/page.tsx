import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskUpsellsClient } from "@/components/hms/frontdesk/upsells/FrontDeskUpsellsClient";

export const metadata: Metadata = {
  title: "Extras at check-in",
};

export default async function FrontDeskUpsellsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskUpsellsClient slug={slug} />
    </HMSLayout>
  );
}
