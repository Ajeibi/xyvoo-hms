import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskFeedbackClient } from "@/components/hms/frontdesk/feedback/FrontDeskFeedbackClient";

export const metadata: Metadata = {
  title: "Guest feedback",
};

export default async function FrontDeskFeedbackPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskFeedbackClient slug={slug} />
    </HMSLayout>
  );
}
