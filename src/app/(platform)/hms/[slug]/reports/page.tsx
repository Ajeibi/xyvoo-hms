import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, ChartNoAxesColumn } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { getReportsPageContext } from "@/lib/hms/reports/page";
import { reportsFor, type ReportDef, type ReportGroup } from "@/lib/hms/reports/library";

export const metadata: Metadata = { title: "Reports" };

const GROUP_ORDER: ReportGroup[] = ["Management", "Front desk", "Money", "Sales", "Housekeeping"];

export default async function ReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getReportsPageContext(slug);

  if (!page) {
    return (
      <HMSLayout slug={slug} requiredSection="reports">
        <HmsPage>
          <HmsPageHeader eyebrow="Reports" meaning="money" title="Reports" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const available = reportsFor(page.caps);
  const groups = GROUP_ORDER.map((g) => ({ group: g, reports: available.filter((r) => r.group === g) })).filter((g) => g.reports.length > 0);

  return (
    <HMSLayout slug={slug} requiredSection="reports">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Reports"
          meaning="money"
          title="Reports"
          description="Every report reads your live arrivals, bills and sales. Open one on screen, download it as Excel, PDF or CSV, or have it emailed on a schedule."
          actions={
            page.caps.canSchedule ? (
              <Link href={`/hms/${slug}/reports/schedules`} className={hmsButton.secondary}>
                <CalendarClock className="h-4 w-4" aria-hidden /> Scheduled emails
              </Link>
            ) : null
          }
        />

        {groups.length === 0 ? (
          <HmsEmptyState icon={ChartNoAxesColumn} meaning="money" title="No reports for your role" description="Ask an owner or manager if you need one of these." />
        ) : (
          groups.map((g) => (
            <HmsCard key={g.group} id={`reports-${g.group.toLowerCase().replace(/\s+/g, "-")}`} title={g.group} icon={ChartNoAxesColumn} meaning="money">
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {g.reports.map((r: ReportDef) => (
                  <li key={r.key}>
                    <Link
                      href={`/hms/${slug}/reports/${r.key}`}
                      className="block h-full rounded-xl border border-slate-200 p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <span className="font-semibold text-slate-900">{r.title}</span>
                      <span className="mt-1 block text-sm text-slate-600">{r.description}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </HmsCard>
          ))
        )}

        {page.caps.canViewFinance ? (
          <HmsCard id="reports-books" title="From the books" description="The financial statements live in Accounts." meaning="money">
            <ul className="flex flex-wrap gap-2">
              {[
                ["Income statement", "accounts/income-statement"],
                ["Department profit and loss", "accounts/department-pnl"],
                ["Balance sheet", "accounts/balance-sheet"],
                ["Tax returns", "accounts/tax"],
                ["Budgets", "accounts/budgets"],
              ].map(([label, path]) => (
                <li key={path}>
                  <Link href={`/hms/${slug}/${path}`} className={hmsButton.small}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </HmsCard>
        ) : null}
      </HmsPage>
    </HMSLayout>
  );
}
