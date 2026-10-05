import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import { listGuestRequestsForTenant } from "@/lib/hms/guest-services";
import { HousekeepingGuestRequestsClient } from "@/components/hms/housekeeping/HousekeepingGuestRequestsClient";

export default async function HousekeepingGuestRequestsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-guest-requests">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Guest requests</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const gsCaps = getGuestServicesCapabilities({
    membershipRole: access.role ?? "staff",
    departmentRole: access.departmentRole,
  });

  const service = createServerSupabaseClient();
  const { requests } = await listGuestRequestsForTenant(
    service,
    tenant.id,
    { department: "housekeeping" },
    gsCaps,
  );

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-guest-requests">
      <HousekeepingGuestRequestsClient
        slug={slug}
        tenantId={tenant.id}
        requests={requests}
        capabilities={gsCaps}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
