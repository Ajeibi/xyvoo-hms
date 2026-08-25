import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getTrialBalance } from "@/lib/hms/journal-entries";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsTrialBalanceClient } from "@/components/hms/accounts/AccountsTrialBalanceClient";

export default async function AccountsTrialBalancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-trial-balance">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Trial balance</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-trial-balance">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Trial balance</h1>
          <p className="mt-0.5 text-sm text-slate-500">You don&apos;t have access to this report.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const rows = await getTrialBalance(service, tenant.id);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="accounts-trial-balance">
      <AccountsTrialBalanceClient
        slug={slug}
        initialRows={rows}
        currency={currency}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
