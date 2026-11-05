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
import { formatPricingAmount, normalizePricingSetup } from "@/lib/hms/room-pricing";

export default async function AccountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Accounts" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const [accounts, entries] = await Promise.all([
    listChartOfAccounts(service, tenant.id),
    listJournalEntries(service, tenant.id, { limit: 200 }),
  ]);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const postedThisMonth = entries.filter((e) => new Date(e.entryDate) >= startOfMonth).length;
  const recentEntries = entries.slice(0, 5);

  return (
    <HMSLayout slug={slug} requiredSection="accounts">
      <HmsPage wide>
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
                {recentEntries.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-4 px-4 py-3.5 text-sm transition-colors hover:bg-slate-50/70 sm:items-center sm:px-6">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 sm:truncate">{e.memo}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{new Date(e.entryDate).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                    </div>
                    <p className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1 font-semibold tabular-nums text-slate-900">
                      {formatPricingAmount(e.total, currency)}
                    </p>
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
