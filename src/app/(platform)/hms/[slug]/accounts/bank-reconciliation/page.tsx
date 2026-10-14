import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
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
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Bank reconciliation" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-bank-reconciliation">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Bank reconciliation" description="You don't have access to this report." />
        </HmsPage>
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
