import DepartmentDashboardScaffold from "@/components/hms/DepartmentDashboardScaffold";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function HRPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <DepartmentDashboardScaffold
        title="HR"
        meaning="team"
        subtitle="Keep staffing, schedules, and HR follow-ups in one department-specific workspace."
        settingsHref={`/hms/${slug}/hr/settings`}
        comingSoon="HR isn't ready yet. Rotas, clocking in and out, and leave requests are on the way. You can already add staff and set what they can see in Settings."
      />
    </HMSLayout>
  );
}
