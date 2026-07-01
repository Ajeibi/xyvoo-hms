import HMSLayout from "@/components/hms/HMSLayout";
import { FbSectionWithNotifications } from "@/components/hms/fb/FbSectionWithNotifications";
import { KitchenHistoryClient } from "@/components/hms/kitchen/KitchenHistoryClient";
import { loadKitchenHistoryPageModel } from "@/lib/hms/load-fb-pages";

export default async function KitchenHistoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const model = await loadKitchenHistoryPageModel(slug);

  return (
    <HMSLayout slug={slug} requiredSection="kitchen">
      {model ? (
        <FbSectionWithNotifications slug={model.slug} tenantId={model.tenantId} area="kitchen">
          <KitchenHistoryClient slug={model.slug} tenantId={model.tenantId} initial={model.initial} />
        </FbSectionWithNotifications>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
