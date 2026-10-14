import { Users } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function HRSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="hr-settings">
      <ModuleScaffold
        eyebrow="HR"
        meaning="team"
        icon={Users}
        title="HR Settings"
        subtitle="Configure team workflows, schedule defaults, and HR dashboard preferences."
        checklist={[
          "Shift templates and schedule rules",
          "Attendance and lateness policies",
          "Leave request workflow and approvals",
          "Department staffing alerts",
          "HR dashboard summaries and reminders",
        ]}
      />
    </HMSLayout>
  );
}
