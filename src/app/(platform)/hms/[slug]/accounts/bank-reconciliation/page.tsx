import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listBankReconciliations } from "@/lib/hms/bank-reconciliation";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsBankReconciliationListClient } from "@/components/hms/accounts/AccountsBankReconciliationListClient";

export default async function AccountsBankReconciliationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-bank-reconciliation">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Bank reconciliation</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-bank-reconciliation">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Bank reconciliation</h1>
          <p className="mt-0.5 text-sm text-slate-500">You don&apos;t have access to this report.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const accounts = await listChartOfAccounts(service, tenant.id, { activeOnly: true });
  const cashAccounts = accounts.filter((a) => a.isCashEquivalent);

  const accountsWithHistory = await Promise.all(
    cashAccounts.map(async (a) => ({
      account: a,
      reconciliations: await listBankReconciliations(service, tenant.id, a.id),
    })),
  );

  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="accounts-bank-reconciliation">
      <AccountsBankReconciliationListClient
        slug={slug}
        accountsWithHistory={accountsWithHistory}
        currency={currency}
        canReconcile={caps.canReconcileBankAccounts}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
