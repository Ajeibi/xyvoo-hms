import HMSLayout from "@/components/hms/HMSLayout";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { FbTipsClient } from "@/components/hms/fb/FbTipsClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";

export default async function RestaurantBarTipsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      {tenant ? (
        <FbRestaurantBarShell
          slug={slug}
          tenantId={tenant.id}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <FbTipsClient slug={slug} currency={normalizePricingSetup(tenant.pricing_setup).currency} />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-base text-slate-600">Property not found.</p>
      )}
    </HMSLayout>
  );
}
