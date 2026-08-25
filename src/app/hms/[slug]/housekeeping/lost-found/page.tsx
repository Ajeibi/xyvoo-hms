import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { listLostFoundItems } from "@/lib/hms/housekeeping-lost-found";
import { HousekeepingLostFoundClient } from "@/components/hms/housekeeping/HousekeepingLostFoundClient";

export default async function HousekeepingLostFoundPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-lost-found">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Lost &amp; found</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getHousekeepingCapabilities({
    membershipRole: access.role ?? "staff",
    departmentRole: access.departmentRole,
  });

  const service = createServerSupabaseClient();
  const items = await listLostFoundItems(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-lost-found">
      <HousekeepingLostFoundClient
        slug={slug}
        tenantId={tenant.id}
        items={items}
        canResolve={caps.canResolveLostFound}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
