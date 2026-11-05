import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listFixedAssets } from "@/lib/hms/fixed-assets";
import { AccountsFixedAssetsClient } from "@/components/hms/accounts/AccountsFixedAssetsClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsFixedAssetsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-fixed-assets">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Fixed assets" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const [assets, accounts] = await Promise.all([
    listFixedAssets(service, tenant.id),
    listChartOfAccounts(service, tenant.id, { activeOnly: true }),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-fixed-assets">
      <AccountsFixedAssetsClient
        slug={slug}
        assets={assets}
        payAccounts={accounts.filter((a) => a.type === "asset" && a.isCashEquivalent || a.code === "2000").map((a) => ({ id: a.id, label: `${a.code} ${a.name}` }))}
        today={new Date().toISOString().slice(0, 10)}
        canManage={caps.canPostJournalEntry}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
