import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskAreaView } from "@/components/hms/frontdesk/FrontDeskAreaView";

export default async function FrontDeskNightPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskAreaView slug={slug} area="night" />
    </HMSLayout>
  );
}
