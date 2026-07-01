import HMSLayout from "@/components/hms/HMSLayout";
import { FbSectionWithNotifications } from "@/components/hms/fb/FbSectionWithNotifications";
import { FbPosClient } from "@/components/hms/fb/FbPosClient";
import { loadFbPosPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const model = await loadFbPosPageModel(slug);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      {model ? (
        <FbSectionWithNotifications slug={model.slug} tenantId={model.tenantId} area="restaurant">
          <FbPosClient
            slug={model.slug}
            tenantId={model.tenantId}
            currency={model.currency}
            initial={model.initial}
          />
        </FbSectionWithNotifications>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
