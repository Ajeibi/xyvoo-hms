import DepartmentDashboardScaffold from "@/components/hms/DepartmentDashboardScaffold";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function MaintenancePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="maintenance">
      <DepartmentDashboardScaffold
        title="Maintenance"
        subtitle="Coordinate work orders, planned servicing, and room recovery from one maintenance dashboard."
        settingsHref={`/hms/${slug}/maintenance/settings`}
        highlights={[
          { label: "Open work orders", value: "6", detail: "Active issues waiting on technician action or parts." },
          { label: "Rooms blocked", value: "2", detail: "Rooms currently unavailable because of maintenance tasks." },
          { label: "Preventive tasks", value: "4", detail: "Scheduled maintenance jobs due in the current cycle." },
        ]}
      />
    </HMSLayout>
  );
}
