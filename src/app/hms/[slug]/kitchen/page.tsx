import HMSLayout from "@/components/hms/HMSLayout";
import { FbSectionWithNotifications } from "@/components/hms/fb/FbSectionWithNotifications";
import { KitchenKdsClient } from "@/components/hms/kitchen/KitchenKdsClient";
import { loadKitchenKdsPageModel } from "@/lib/hms/load-fb-pages";

export default async function KitchenPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const model = await loadKitchenKdsPageModel(slug);

  return (
    <HMSLayout slug={slug} requiredSection="kitchen">
      {model ? (
        <FbSectionWithNotifications slug={model.slug} tenantId={model.tenantId} area="kitchen">
          <KitchenKdsClient slug={model.slug} tenantId={model.tenantId} initial={model.initial} />
        </FbSectionWithNotifications>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
