import HMSLayout from "@/components/hms/HMSLayout";
import { FbBillRatesSetup } from "@/components/hms/fb/FbBillRatesSetup";
import { FbCourseSetup } from "@/components/hms/fb/FbCourseSetup";
import { FbModifierGroupsSetup } from "@/components/hms/fb/FbModifierGroupsSetup";
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
          <FbModifierGroupsSetup
            slug={model.slug}
            tenantId={tenant.id}
            currency={model.currency}
            outlets={model.initial.outlets}
            categories={model.initial.categories}
            items={model.initial.items}
            initialGroups={model.initial.modifierGroups}
            initialLinks={model.initial.modifierLinks}
          />
          <FbBillRatesSetup
            slug={model.slug}
            currency={model.currency}
            initial={model.initial.billRates}
          />
          <FbCourseSetup
            slug={model.slug}
            tenantId={tenant.id}
            outlets={model.initial.outlets}
            categories={model.initial.categories}
          />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-base text-slate-600">Property not found.</p>
      )}
    </HMSLayout>
  );
}
