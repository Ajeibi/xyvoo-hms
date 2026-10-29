import HMSLayout from "@/components/hms/HMSLayout";
import { FbCashUpClient } from "@/components/hms/fb/FbCashUpClient";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadMenuSetupMeta } from "@/lib/hms/fb-menu";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function RestaurantBarCashUpPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const meta = tenant ? await loadMenuSetupMeta(createServerSupabaseClient(), tenant.id) : null;

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      {tenant && meta ? (
        <FbRestaurantBarShell
          slug={slug}
          tenantId={tenant.id}
          observerMode={access.canAccessAllDepartments}
          showDepartmentNav={access.canAccessAllDepartments}
        >
          <FbCashUpClient
            slug={slug}
            currency={normalizePricingSetup(tenant.pricing_setup).currency}
            outlets={meta.outlets.filter((o) => o.is_active).map((o) => ({ id: o.id, name: o.name }))}
          />
        </FbRestaurantBarShell>
      ) : (
        <p className="p-8 text-base text-slate-600">Property not found.</p>
      )}
    </HMSLayout>
  );
}
