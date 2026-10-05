import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function MaintenanceSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="maintenance-settings">
      <ModuleScaffold
        title="Maintenance Settings"
        subtitle="Configure work-order priorities, room blocking rules, and technician workflow."
        checklist={[
          "Work-order categories and priorities",
          "Room out-of-order and release rules",
          "Technician assignments and shift defaults",
          "Preventive maintenance schedules",
          "Maintenance dashboard summaries and alerts",
        ]}
      />
    </HMSLayout>
  );
}
