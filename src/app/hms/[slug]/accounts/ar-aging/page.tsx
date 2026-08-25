import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getArAgingReport } from "@/lib/hms/customer-invoices";
import { AccountsArAgingClient } from "@/components/hms/accounts/AccountsArAgingClient";

export default async function AccountsArAgingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ar-aging">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">AR aging</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const rows = await getArAgingReport(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-ar-aging">
      <AccountsArAgingClient slug={slug} rows={rows} canAccessAllDepartments={access.canAccessAllDepartments} />
    </HMSLayout>
  );
}
