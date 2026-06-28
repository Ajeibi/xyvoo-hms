import HMSLayout from "@/components/hms/HMSLayout";
import { FbSettingsClient } from "@/components/hms/fb/FbSettingsClient";
import { loadFbSettingsPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = await loadFbSettingsPageModel(slug);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar-settings">
      {model ? (
        <FbSettingsClient slug={model.slug} />
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
