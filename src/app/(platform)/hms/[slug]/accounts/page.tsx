import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listJournalEntries } from "@/lib/hms/journal-entries";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsStatTile } from "@/components/hms/dashboard-tiles";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsStatStrip, hmsButton } from "@/components/hms/hms-ui";
import { BookOpen, NotebookPen, Scale } from "lucide-react";

export default async function AccountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Accounts" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const [accounts, entries] = await Promise.all([
    listChartOfAccounts(service, tenant.id),
    listJournalEntries(service, tenant.id, { limit: 5 }),
  ]);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const postedThisMonth = entries.filter((e) => new Date(e.entryDate) >= startOfMonth).length;

  return (
    <HMSLayout slug={slug} requiredSection="accounts">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Accounts"
          meaning="money"
          title="Accounts"
          description="The general ledger: chart of accounts, journal entries and trial balance."
        />

        <AccountsSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />

        <HmsStatStrip label="Accounts at a glance" columns={3}>
          <HmsStatTile
            href={`/hms/${slug}/accounts/chart`}
            icon={BookOpen}
            meaning="money"
            label="Chart of accounts"
            value={accounts.length}
            hint={`${accounts.filter((a) => a.isActive).length} active`}
          />
          <HmsStatTile
            href={`/hms/${slug}/accounts/journal`}
            icon={NotebookPen}
            meaning="rooms"
            label="Journal entries"
            value={postedThisMonth}
            hint="posted this month"
          />
          <HmsStatTile
            href={`/hms/${slug}/accounts/trial-balance`}
            icon={Scale}
            meaning="team"
            label="Trial balance"
            value={<span className="text-base font-semibold text-blue-700">View report →</span>}
            hint="every account, as of today"
          />
        </HmsStatStrip>

        {accounts.length === 0 ? (
          <HmsEmptyState
            art="page"
            meaning="money"
            title="No chart of accounts yet"
            description="Load a hospitality starter template, or add accounts one at a time."
            action={
              <Link href={`/hms/${slug}/accounts/chart`} className={hmsButton.primary}>
                Go to chart of accounts
              </Link>
            }
          />
        ) : (
          <HmsCard
            id="accounts-recent-journal"
            title="Recent journal entries"
            icon={NotebookPen}
            meaning="money"
            flush
            actions={
              <Link href={`/hms/${slug}/accounts/journal`} className={hmsButton.quiet}>
                View all
              </Link>
            }
          >
            {entries.length === 0 ? (
              <HmsEmptyState bare art="page" meaning="money" title="No journal entries posted yet" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {entries.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{e.memo}</p>
                      <p className="text-sm text-slate-600">{new Date(e.entryDate).toLocaleDateString()}</p>
                    </div>
                    <p className="tabular-nums font-semibold text-slate-900">{e.total.toFixed(2)}</p>
                  </li>
                ))}
              </ul>
            )}
          </HmsCard>
        )}
      </HmsPage>
    </HMSLayout>
  );
}
