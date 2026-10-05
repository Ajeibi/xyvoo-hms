import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getAccountLedger } from "@/lib/hms/financial-statements";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsLedgerClient } from "@/components/hms/accounts/AccountsLedgerClient";

export default async function AccountsLedgerPage({
  params,
}: {
  params: Promise<{ slug: string; accountId: string }>;
}) {
  const { slug, accountId } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ledger">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Account ledger</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ledger">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Account ledger</h1>
          <p className="mt-0.5 text-sm text-slate-500">You don&apos;t have access to this report.</p>
        </div>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const result = await getAccountLedger(service, tenant.id, accountId);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  if (!result) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ledger">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Account ledger</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Account not found.{" "}
            <Link href={`/hms/${slug}/accounts/chart`} className="text-blue-600 hover:underline">
              Back to chart of accounts
            </Link>
          </p>
        </div>
      </HMSLayout>
    );
  }

  return (
    <HMSLayout slug={slug} requiredSection="accounts-ledger">
      <AccountsLedgerClient slug={slug} accountId={accountId} initialResult={result} currency={currency} />
    </HMSLayout>
  );
}
