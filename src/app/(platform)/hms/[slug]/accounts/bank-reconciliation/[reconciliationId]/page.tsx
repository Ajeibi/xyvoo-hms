import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
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
  const [detail, accounts] = await Promise.all([
    getBankReconciliation(service, tenant.id, reconciliationId),
    listChartOfAccounts(service, tenant.id),
  ]);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  if (!detail) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-bank-reconciliation">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Bank reconciliation</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Reconciliation not found.{" "}
            <Link href={`/hms/${slug}/accounts/bank-reconciliation`} className="text-blue-600 hover:underline">
              Back to bank reconciliation
            </Link>
          </p>
        </div>
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
