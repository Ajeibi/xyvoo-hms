import HMSLayout from "@/components/hms/HMSLayout";
import { FbTablesClient } from "@/components/hms/fb/FbTablesClient";
import { loadFbTablesPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarTablesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = await loadFbTablesPageModel(slug);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      {model ? (
        <FbTablesClient slug={model.slug} tenantId={model.tenantId} initial={model.initial} />
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
