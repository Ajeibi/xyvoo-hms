import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function FrontDeskSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk-settings">
      <ModuleScaffold
        title="Front Desk Settings"
        subtitle="Adjust front desk defaults, counters, and arrival workflow preferences."
        checklist={[
          "Check-in desk counters and shift labels",
          "Walk-in reservation defaults",
          "Arrival queue priorities and status prompts",
          "Room move and upgrade approval rules",
          "Front desk summary cards and alerts",
        ]}
      />
    </HMSLayout>
  );
}
