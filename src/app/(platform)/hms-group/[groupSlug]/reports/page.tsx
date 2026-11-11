import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { GroupRangeBar } from "@/components/hms/groups/GroupRangeBar";
import { ReportView } from "@/components/hms/reports/ReportView";
import { loadGroupFigures } from "@/lib/hms/groups/group-dashboard";
import { lagosToday, rangeFromSearch, requireGroupPage } from "@/lib/hms/groups/group-page";
import { groupPerformanceDocument } from "@/lib/hms/groups/group-reports";

export const metadata = { title: "Reports" };

export default async function GroupReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { groupSlug } = await params;
  const ctx = await requireGroupPage(groupSlug);
  const { from, to } = rangeFromSearch(await searchParams, lagosToday());
  const figures = await loadGroupFigures(ctx.userDb, ctx.hotels, { from, to }, true);
  const doc = groupPerformanceDocument(ctx.group.name, figures, ctx.group.baseCurrency);

  return (
    <HmsPage wide>
      <HmsPageHeader eyebrow="Hotel group" title="Performance by hotel" description="Occupancy, ADR, RevPAR and revenue for every hotel and the group, for any dates. Download it for Excel, as a PDF or CSV." />
      <GroupRangeBar action={`/hms-group/${groupSlug}/reports`} from={from} to={to} exportBase={`/api/hotel/groups/${groupSlug}/export`} report="performance" />
      <ReportView document={doc} />
    </HmsPage>
  );
}
