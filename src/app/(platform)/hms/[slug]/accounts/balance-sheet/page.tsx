import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getBalanceSheet } from "@/lib/hms/financial-statements";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsBalanceSheetClient } from "@/components/hms/accounts/AccountsBalanceSheetClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsBalanceSheetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-balance-sheet">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Balance sheet" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-balance-sheet">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Balance sheet" description="You don't have access to this report." />
        </HmsPage>
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
