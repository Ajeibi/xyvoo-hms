import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listJournalEntries } from "@/lib/hms/journal-entries";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

export default async function AccountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Accounts</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
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
      <div className="w-full px-6 py-8 sm:px-8">
        <h1 className="text-xl font-semibold text-slate-900">Accounts</h1>
        <p className="mt-0.5 text-sm text-slate-500">The general ledger — chart of accounts, journal entries, and trial balance.</p>

        <AccountsSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link href={`/hms/${slug}/accounts/chart`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chart of accounts</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{accounts.length}</p>
            <p className="mt-1 text-xs text-slate-500">{accounts.filter((a) => a.isActive).length} active</p>
          </Link>
          <Link href={`/hms/${slug}/accounts/journal`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Journal entries</p>
            <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{postedThisMonth}</p>
            <p className="mt-1 text-xs text-slate-500">posted this month</p>
          </Link>
          <Link href={`/hms/${slug}/accounts/trial-balance`} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trial balance</p>
            <p className="mt-2 text-sm font-medium text-blue-700">View report →</p>
            <p className="mt-1 text-xs text-slate-500">every account, as of today</p>
          </Link>
        </div>

        {accounts.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
            <p className="text-sm font-medium text-slate-900">No chart of accounts yet.</p>
            <p className="mt-1 text-sm text-slate-500">
              Head to{" "}
              <Link href={`/hms/${slug}/accounts/chart`} className="font-medium text-blue-700 underline">
                Chart of accounts
              </Link>{" "}
              to load a hospitality starter template, or add accounts one at a time.
            </p>
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">Recent journal entries</h2>
            {entries.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">No journal entries posted yet.</p>
            ) : (
              <div className="mt-3 divide-y divide-slate-100">
                {entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{e.memo}</p>
                      <p className="text-xs text-slate-500">{new Date(e.entryDate).toLocaleDateString()}</p>
                    </div>
                    <p className="tabular-nums font-medium text-slate-700">{e.total.toFixed(2)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </HMSLayout>
  );
}
