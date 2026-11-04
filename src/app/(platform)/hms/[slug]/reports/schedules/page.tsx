import type { Metadata } from "next";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { SchedulesClient } from "@/components/hms/reports/SchedulesClient";
import { getReportsPageContext } from "@/lib/hms/reports/page";
import { reportsFor } from "@/lib/hms/reports/library";
import { mapSchedule, SCHEDULE_COLUMNS } from "@/lib/hms/reports/schedule-rules";
import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Scheduled reports" };

export default async function ReportSchedulesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const page = await getReportsPageContext(slug);

  if (!page || !page.caps.canSchedule) {
    return (
      <HMSLayout slug={slug} requiredSection="reports">
        <HmsPage>
          <HmsPageHeader eyebrow="Reports" meaning="money" title="Scheduled emails" />
          <HmsEmptyState meaning="money" title="Only owners, admins and Accounts can schedule reports" description="Ask one of them to set this up." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const [{ data }, user] = await Promise.all([
    createServerSupabaseClient().schema("hotel").from("report_schedules").select(SCHEDULE_COLUMNS).eq("tenant_id", page.tenant.id).order("created_at", { ascending: true }),
    getSessionUser(),
  ]);
  const wanted = Array.isArray(search.report) ? search.report[0] : search.report;

  return (
    <HMSLayout slug={slug} requiredSection="reports">
      <SchedulesClient
        slug={slug}
        reports={reportsFor(page.caps).map((r) => ({ key: r.key, title: r.title }))}
        initial={(data ?? []).map(mapSchedule)}
        defaultReport={wanted ?? "managers"}
        defaultEmail={user?.email ?? ""}
      />
    </HMSLayout>
  );
}
