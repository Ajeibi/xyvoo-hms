import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskMessagesClient } from "@/components/hms/frontdesk/messages/FrontDeskMessagesClient";

export const metadata: Metadata = {
  title: "Message guests",
};

export default async function FrontDeskMessagesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskMessagesClient slug={slug} />
    </HMSLayout>
  );
}
