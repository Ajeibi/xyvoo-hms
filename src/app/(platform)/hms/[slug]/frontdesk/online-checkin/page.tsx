import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskOnlineCheckInClient } from "@/components/hms/frontdesk/onlinecheckin/FrontDeskOnlineCheckInClient";

export const metadata: Metadata = {
  title: "Online check-in",
};

export default async function FrontDeskOnlineCheckInPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskOnlineCheckInClient slug={slug} />
    </HMSLayout>
  );
}
