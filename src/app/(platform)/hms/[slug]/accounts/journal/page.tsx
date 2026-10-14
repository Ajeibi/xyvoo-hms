import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listJournalEntries } from "@/lib/hms/journal-entries";
import { AccountsJournalClient } from "@/components/hms/accounts/AccountsJournalClient";

export default async function AccountsJournalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-journal">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Journal entries" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const [accounts, entries] = await Promise.all([
    listChartOfAccounts(service, tenant.id, { activeOnly: true }),
    listJournalEntries(service, tenant.id, { limit: 200 }),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-journal">
      <AccountsJournalClient
        slug={slug}
        accounts={accounts}
        entries={entries}
        canPost={caps.canPostJournalEntry}
        canReverse={caps.canReverseJournalEntry}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
