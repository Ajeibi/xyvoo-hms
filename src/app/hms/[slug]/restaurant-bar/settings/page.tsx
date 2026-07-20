import HMSLayout from "@/components/hms/HMSLayout";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import HotelMenuSetup from "@/components/hms/HotelMenuSetup";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadHotelMenuSetupModel } from "@/lib/hms/load-fb-pages";

export default async function RestaurantBarSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, model, access] = await Promise.all([
    getHotelTenantBySlug(slug),
    loadHotelMenuSetupModel(slug),
    getHmsAccessContext(slug),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar-settings">
      {model && tenant ? (
        <FbRestaurantBarShell
          slug={model.slug}
          tenantId={tenant.id}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <HotelMenuSetup
            slug={model.slug}
            currency={model.currency}
            initial={model.initial}
          />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-sm text-slate-500">Property not found.</p>
      )}
    </HMSLayout>
  );
}
