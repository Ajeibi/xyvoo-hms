import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskParcelsClient } from "@/components/hms/frontdesk/parcels/FrontDeskParcelsClient";

export const metadata: Metadata = {
  title: "Parcels",
};

export default async function FrontDeskParcelsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskParcelsClient slug={slug} />
    </HMSLayout>
  );
}
