import { Suspense } from "react";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskCheckoutRedirect } from "@/components/hms/frontdesk/checkout/FrontDeskCheckoutRedirect";

export default async function FrontDeskCheckoutPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <Suspense fallback={<p className="p-8 text-sm text-slate-500">Loading checkout…</p>}>
        <FrontDeskCheckoutRedirect slug={slug} />
      </Suspense>
    </HMSLayout>
  );
}
