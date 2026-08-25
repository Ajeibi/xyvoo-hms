import HMSLayout from "@/components/hms/HMSLayout";
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
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Journal entries</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
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
