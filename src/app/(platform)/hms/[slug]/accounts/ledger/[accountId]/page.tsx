import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getAccountLedger } from "@/lib/hms/financial-statements";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsLedgerClient } from "@/components/hms/accounts/AccountsLedgerClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

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
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Account ledger" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ledger">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Account ledger" description="You don't have access to this report." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const result = await getAccountLedger(service, tenant.id, accountId);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  if (!result) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ledger">
        <HmsPage>
          <HmsPageHeader
            eyebrow="Accounts"
            meaning="money"
            title="Account ledger"
            description={
              <>
                Account not found.{" "}
                <Link href={`/hms/${slug}/accounts/chart`} className="font-medium text-blue-700 underline-offset-2 hover:underline">
                  Back to chart of accounts
                </Link>
              </>
            }
          />
        </HmsPage>
      </HMSLayout>
    );
  }

  return (
    <HMSLayout slug={slug} requiredSection="accounts-ledger">
      <AccountsLedgerClient slug={slug} accountId={accountId} initialResult={result} currency={currency} />
    </HMSLayout>
  );
}
