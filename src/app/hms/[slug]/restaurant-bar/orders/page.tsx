import HMSLayout from "@/components/hms/HMSLayout";
import { FbOrdersClient } from "@/components/hms/fb/FbOrdersClient";
import { loadFbOrdersPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarOrdersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = await loadFbOrdersPageModel(slug);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      {model ? (
        <FbOrdersClient
          slug={model.slug}
          tenantId={model.tenantId}
          currency={model.currency}
          initial={model.initial}
        />
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
