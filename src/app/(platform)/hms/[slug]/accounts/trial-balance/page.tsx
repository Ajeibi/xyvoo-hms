import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getTrialBalance } from "@/lib/hms/journal-entries";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsTrialBalanceClient } from "@/components/hms/accounts/AccountsTrialBalanceClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsTrialBalancePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-trial-balance">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Trial balance" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-trial-balance">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Trial balance" description="You don't have access to this report." />
        </HmsPage>
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
