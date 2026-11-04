import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarClock, Download } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { ReportView } from "@/components/hms/reports/ReportView";
import { HmsEmptyState, HmsPage, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { buildReport, getReportDef } from "@/lib/hms/reports/library";
import { getReportsPageContext, paramsFromSearch } from "@/lib/hms/reports/page";

export const metadata: Metadata = { title: "Report" };

export default async function ReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; report: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug, report }, search] = await Promise.all([params, searchParams]);
  const page = await getReportsPageContext(slug);
  const def = getReportDef(report);

  if (!page || !def) {
    return (
      <HMSLayout slug={slug} requiredSection="reports">
        <HmsPage>
          <HmsPageHeader eyebrow="Reports" meaning="money" title="Report not found" description="That report does not exist." />
          <Link href={`/hms/${slug}/reports`} className={hmsButton.secondary}>
            <ArrowLeft className="h-4 w-4" aria-hidden /> All reports
          </Link>
        </HmsPage>
      </HMSLayout>
    );
  }

  const allowed = def.audience === "finance" ? page.caps.canViewFinance : page.caps.canViewOperations;
  if (!allowed) {
    return (
      <HMSLayout slug={slug} requiredSection="reports">
        <HmsPage>
          <HmsPageHeader eyebrow="Reports" meaning="money" title={def.title} />
          <HmsEmptyState meaning="money" title="Your role can't run this report" description="Ask an owner, a manager or Accounts if you need it." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const p = paramsFromSearch(search, page.ctx.businessDate);
  let document;
  let failed = false;
  try {
    document = await buildReport(def, page.ctx, p);
  } catch (e) {
    console.error(`[reports ${def.key}]`, e);
    failed = true;
  }

  const query = new URLSearchParams({ slug, report: def.key });
  if (def.period === "day") query.set("date", p.date);
  if (def.period === "range") {
    query.set("from", p.from);
    query.set("to", p.to);
  }
  const downloads: [string, string][] = [
    ["Excel", "xlsx"],
    ["PDF", "pdf"],
    ["CSV", "csv"],
  ];

  return (
    <HMSLayout slug={slug} requiredSection="reports">
      <HmsPage wide>
        <HmsPageHeader
          eyebrow="Reports"
          meaning="money"
          title={def.title}
          description={document?.subtitle ?? def.description}
          actions={
            <>
              {downloads.map(([label, format]) => (
                <a key={format} href={`/api/hotel/reports/export?${query}&format=${format}`} className={`${hmsButton.secondary} print:hidden`}>
                  <Download className="h-4 w-4" aria-hidden /> {label}
                </a>
              ))}
              {page.caps.canSchedule ? (
                <Link href={`/hms/${slug}/reports/schedules?report=${def.key}`} className={`${hmsButton.secondary} print:hidden`}>
                  <CalendarClock className="h-4 w-4" aria-hidden /> Email on a schedule
                </Link>
              ) : null}
            </>
          }
        />

        <Link href={`/hms/${slug}/reports`} className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline print:hidden">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All reports
        </Link>

        {def.period !== "none" ? (
          <form method="get" className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm print:hidden">
            {def.period === "day" ? (
              <label className="block w-[12rem] text-sm font-medium text-slate-800">
                Date
                <input type="date" name="date" defaultValue={p.date} className={`${hmsInput} mt-1`} />
              </label>
            ) : (
              <>
                <label className="block w-[12rem] text-sm font-medium text-slate-800">
                  From
                  <input type="date" name="from" defaultValue={p.from} className={`${hmsInput} mt-1`} />
                </label>
                <label className="block w-[12rem] text-sm font-medium text-slate-800">
                  To
                  <input type="date" name="to" defaultValue={p.to} className={`${hmsInput} mt-1`} />
                </label>
              </>
            )}
            <button type="submit" className={hmsButton.primary}>
              Run report
            </button>
          </form>
        ) : null}

        {failed || !document ? (
          <HmsEmptyState meaning="money" title="This report couldn't be built" description="Something went wrong while reading the data. Try again in a moment." />
        ) : (
          <ReportView document={document} />
        )}
      </HmsPage>
    </HMSLayout>
  );
}
