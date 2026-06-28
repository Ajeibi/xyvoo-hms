import DepartmentDashboardScaffold from "@/components/hms/DepartmentDashboardScaffold";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function HRPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <DepartmentDashboardScaffold
        title="HR"
        subtitle="Keep staffing, schedules, and HR follow-ups in one department-specific workspace."
        settingsHref={`/hms/${slug}/hr/settings`}
        highlights={[
          { label: "Open shifts", value: "7", detail: "Shifts still requiring assignment or confirmation." },
          { label: "Team notices", value: "3", detail: "Items waiting for acknowledgement by staff members." },
          { label: "Pending actions", value: "4", detail: "Leave, attendance, or profile updates needing review." },
        ]}
      />
    </HMSLayout>
  );
}
