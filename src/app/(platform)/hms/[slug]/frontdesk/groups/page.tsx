import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskGroupsClient } from "@/components/hms/frontdesk/groups/FrontDeskGroupsClient";

export const metadata: Metadata = {
  title: "Group check-in",
};

export default async function FrontDeskGroupsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskGroupsClient slug={slug} />
    </HMSLayout>
  );
}
