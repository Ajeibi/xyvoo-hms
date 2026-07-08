import HMSLayout from "@/components/hms/HMSLayout";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { FbSettingsClient } from "@/components/hms/fb/FbSettingsClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { loadFbSettingsPageModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [model, access] = await Promise.all([
    loadFbSettingsPageModel(slug),
    getHmsAccessContext(slug),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar-settings">
      {model ? (
        <FbRestaurantBarShell
          slug={model.slug}
          tenantId={model.tenantId}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <FbSettingsClient slug={model.slug} />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
