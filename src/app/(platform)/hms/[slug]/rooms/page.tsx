import { Suspense } from "react";
import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskRoomsClient } from "@/components/hms/frontdesk/rooms/FrontDeskRoomsClient";
import { loadRoomsWorkbenchPageModel } from "@/lib/hms/load-rooms-workbench-page";

export default async function RoomsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { tenantId, initial, capabilities } = await loadRoomsWorkbenchPageModel(slug);

  return (
    <HMSLayout slug={slug} requiredSection="rooms">
      <Suspense fallback={<div className="p-8 text-sm text-slate-500">Loading rooms…</div>}>
        <FrontDeskRoomsClient
          slug={slug}
          tenantId={tenantId}
          initial={initial}
          capabilities={capabilities}
          layoutTitleVariant="topNav"
        />
      </Suspense>
    </HMSLayout>
  );
}
