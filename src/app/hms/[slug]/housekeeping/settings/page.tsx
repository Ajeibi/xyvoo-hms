import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function HousekeepingSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="housekeeping-settings">
      <ModuleScaffold
        title="Housekeeping Settings"
        subtitle="Tune room-cleaning workflows, inspection logic, and shift preferences."
        checklist={[
          "Room readiness statuses and transitions",
          "Cleaning priority rules by room class",
          "Attendant assignment defaults",
          "Inspection and supervisor sign-off flow",
          "Housekeeping dashboard summaries",
        ]}
      />
    </HMSLayout>
  );
}
