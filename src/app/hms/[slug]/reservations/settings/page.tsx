import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function ReservationsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="reservations-settings">
      <ModuleScaffold
        title="Reservations Settings"
        subtitle="Manage booking defaults, hold windows, and reservation workflow preferences."
        checklist={[
          "Reservation source defaults and codes",
          "Hold, release, and cancellation windows",
          "Deposit requirements and guarantee rules",
          "Guest communication templates",
          "Reservation dashboard widgets and filters",
        ]}
      />
    </HMSLayout>
  );
}
