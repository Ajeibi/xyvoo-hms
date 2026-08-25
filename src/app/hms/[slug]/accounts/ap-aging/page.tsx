import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getApAgingReport } from "@/lib/hms/vendor-bill-payments";
import { AccountsApAgingClient } from "@/components/hms/accounts/AccountsApAgingClient";

export default async function AccountsApAgingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ap-aging">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">AP aging</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const rows = await getApAgingReport(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-ap-aging">
      <AccountsApAgingClient slug={slug} rows={rows} canAccessAllDepartments={access.canAccessAllDepartments} />
    </HMSLayout>
  );
}
