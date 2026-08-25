import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listInspectionQueue } from "@/lib/hms/housekeeping-tasks";
import { HousekeepingInspectionsClient } from "@/components/hms/housekeeping/HousekeepingInspectionsClient";

export default async function HousekeepingInspectionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="housekeeping-inspections">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Inspections</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const tasks = await listInspectionQueue(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-inspections">
      <HousekeepingInspectionsClient
        slug={slug}
        tenantId={tenant.id}
        tasks={tasks}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
