import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { getBankReconciliation } from "@/lib/hms/bank-reconciliation";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsBankReconciliationDetailClient } from "@/components/hms/accounts/AccountsBankReconciliationDetailClient";

export default async function AccountsBankReconciliationDetailPage({
  params,
}: {
  params: Promise<{ slug: string; reconciliationId: string }>;
}) {
  const { slug, reconciliationId } = await params;
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
  const [detail, accounts] = await Promise.all([
    getBankReconciliation(service, tenant.id, reconciliationId),
    listChartOfAccounts(service, tenant.id),
  ]);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  if (!detail) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-bank-reconciliation">
        <HmsPage>
          <HmsPageHeader
            eyebrow="Accounts"
            meaning="money"
            title="Bank reconciliation"
            description="Reconciliation not found."
            actions={
              <Link href={`/hms/${slug}/accounts/bank-reconciliation`} className={hmsButton.secondary}>
                Back to bank reconciliation
              </Link>
            }
          />
        </HmsPage>
      </HMSLayout>
    );
  }

  const account = accounts.find((a) => a.id === detail.reconciliation.accountId);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-bank-reconciliation">
      <AccountsBankReconciliationDetailClient
        slug={slug}
        initialDetail={detail}
        accountLabel={account ? `${account.code} ${account.name}` : "Account"}
        currency={currency}
        canReconcile={caps.canReconcileBankAccounts}
      />
    </HMSLayout>
  );
}
