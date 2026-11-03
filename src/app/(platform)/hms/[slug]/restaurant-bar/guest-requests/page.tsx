import HMSLayout from "@/components/hms/HMSLayout";
import { FbRestaurantBarShell } from "@/components/hms/fb/FbRestaurantBarShell";
import { FbGuestRequestsClient } from "@/components/hms/fb/FbGuestRequestsClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import { listGuestRequestsForTenant } from "@/lib/hms/guest-services";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function RestaurantBarGuestRequestsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="restaurant-bar">
        <p className="p-8 text-base text-slate-600">Property not found.</p>
      </HMSLayout>
    );
  }

  const caps = getGuestServicesCapabilities({
    membershipRole: access.role ?? "staff",
    departmentRole: access.departmentRole,
  });
  const { requests } = await listGuestRequestsForTenant(
    createServerSupabaseClient(),
    tenant.id,
    { department: "food_beverage" },
    caps,
  );

  return (
    <HMSLayout slug={slug} requiredSection="restaurant-bar">
      <FbRestaurantBarShell
        slug={slug}
        tenantId={tenant.id}
        observerMode={access.canAccessAllDepartments}
        showDepartmentNav={access.canAccessAllDepartments}
      >
        <FbGuestRequestsClient slug={slug} requests={requests} capabilities={caps} />
      </FbRestaurantBarShell>
    </HMSLayout>
  );
}
