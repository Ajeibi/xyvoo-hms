import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listRecurring } from "@/lib/hms/recurring-entries";
import { listVendors } from "@/lib/hms/procurement-vendors";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsRecurringClient } from "@/components/hms/accounts/AccountsRecurringClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsRecurringPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-recurring">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Recurring entries" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const [templates, accounts, vendors] = await Promise.all([
    listRecurring(service, tenant.id),
    listChartOfAccounts(service, tenant.id, { activeOnly: true }),
    listVendors(service, tenant.id, { status: ["active", "preferred"] }),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-recurring">
      <AccountsRecurringClient
        slug={slug}
        templates={templates}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.code} ${a.name}`, type: a.type }))}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        currency={normalizePricingSetup(tenant.pricing_setup).currency}
        today={new Date().toISOString().slice(0, 10)}
        canManage={caps.canPostJournalEntry}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
