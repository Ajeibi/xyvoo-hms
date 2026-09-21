import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getBalanceSheet } from "@/lib/hms/financial-statements";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsBalanceSheetClient } from "@/components/hms/accounts/AccountsBalanceSheetClient";

export default async function AccountsBalanceSheetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-balance-sheet">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Balance sheet</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-balance-sheet">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Balance sheet</h1>
          <p className="mt-0.5 text-sm text-slate-500">You don&apos;t have access to this report.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const asOfDate = new Date().toISOString().slice(0, 10);
  const result = await getBalanceSheet(service, tenant.id, { asOfDate });
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="accounts-balance-sheet">
      <AccountsBalanceSheetClient
        slug={slug}
        initialResult={result}
        initialAsOfDate={asOfDate}
        currency={currency}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
