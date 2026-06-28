import HMSLayout from "@/components/hms/HMSLayout";
import { HousekeepingTaskList } from "@/components/hms/housekeeping/HousekeepingTaskList";
import { getHotelTenantBySlug } from "@/lib/hms/data";

export default async function HousekeepingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Housekeeping</h1>
        <p className="mt-0.5 text-sm text-slate-500">Room cleaning workflow synced with the front desk board.</p>
        {tenant ? <HousekeepingTaskList tenantId={tenant.id} slug={slug} /> : null}
      </div>
    </HMSLayout>
  );
}
