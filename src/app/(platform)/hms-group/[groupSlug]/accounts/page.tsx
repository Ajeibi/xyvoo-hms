import Link from "next/link";
import { HmsAlert, HmsPage, HmsPageHeader, HmsWarning } from "@/components/hms/hms-ui";
import { GroupRangeBar } from "@/components/hms/groups/GroupRangeBar";
import { InterCompanyAccounts } from "@/components/hms/groups/InterCompanyAccounts";
import { ReportView } from "@/components/hms/reports/ReportView";
import { loadGroupAccounts } from "@/lib/hms/groups/group-accounts";
import { openMonthsByHotel } from "@/lib/hms/groups/group-consolidation";
import { lagosToday, rangeFromSearch, requireGroupPage } from "@/lib/hms/groups/group-page";
import { balanceSheetDocument, profitAndLossDocument, trialBalanceDocument, type GroupReportKey } from "@/lib/hms/groups/group-reports";

export const metadata = { title: "Accounts" };

const VIEWS: Array<{ key: GroupReportKey; label: string }> = [
  { key: "profit-and-loss", label: "Profit and loss" },
  { key: "balance-sheet", label: "Balance sheet" },
  { key: "trial-balance", label: "Trial balance" },
];

export default async function GroupAccountsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupSlug } = await params;
  const ctx = await requireGroupPage(groupSlug);
  const search = await searchParams;
  const { from, to } = rangeFromSearch(search, lagosToday());
  const view = VIEWS.find((v) => v.key === search.view)?.key ?? "profit-and-loss";

  let error = "";
  let data: Awaited<ReturnType<typeof loadGroupAccounts>> | null = null;
  try {
    data = await loadGroupAccounts(ctx, from, to);
  } catch (e) {
    error = e instanceof Error ? e.message : "Couldn't read the hotels' books.";
  }
  const cur = ctx.group.baseCurrency;
  const doc = data
    ? view === "trial-balance"
      ? trialBalanceDocument(ctx.group.name, ctx.hotels, data.consolidation, to, cur, data.periods)
      : view === "balance-sheet"
        ? balanceSheetDocument(ctx.group.name, ctx.hotels, data.consolidation, to, cur, data.periods)
        : profitAndLossDocument(ctx.group.name, ctx.hotels, data.consolidation, from, to, cur, data.periods)
    : null;
  const open = data?.periods.filter((p) => !p.final) ?? [];

  return (
    <HmsPage wide>
      <HmsPageHeader eyebrow="Hotel group" meaning="money" title="Consolidated accounts" description="Each hotel keeps its own books. Here they are added up by account code, with money between your hotels taken out." />
      <nav aria-label="Statement" className="flex flex-wrap gap-2">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/hms-group/${groupSlug}/accounts?view=${v.key}&from=${from}&to=${to}`}
            aria-current={v.key === view ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium ${v.key === view ? "bg-xyvoo-blue-deep text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}
          >
            {v.label}
          </Link>
        ))}
      </nav>
      <GroupRangeBar action={`/hms-group/${groupSlug}/accounts`} from={from} to={to} keep={{ view }} exportBase={`/api/hotel/groups/${groupSlug}/export`} report={view} />
      <HmsAlert message={error} />
      {open.length ? (
        <HmsWarning title="Not final yet">
          Months not yet closed: {openMonthsByHotel(open)}. Figures can still change until every hotel closes the month.
        </HmsWarning>
      ) : null}
      {data && data.consolidation.interCompanyMismatch !== 0 ? (
        <HmsWarning title="Inter-company balances don't match">
          The marked accounts leave {data.consolidation.interCompanyMismatch.toLocaleString("en-NG")} that doesn&apos;t cancel out. Check both hotels posted the same amount and both accounts are marked.
        </HmsWarning>
      ) : null}
      {doc ? <ReportView document={doc} /> : null}
      {data ? (
        <InterCompanyAccounts
          groupSlug={groupSlug}
          hotels={ctx.hotels.map((h) => ({ tenantId: h.tenantId, name: h.name }))}
          accountsByHotel={data.accountsByHotel}
          marked={data.interCompany}
          canEdit={ctx.canEdit}
        />
      ) : null}
    </HmsPage>
  );
}
