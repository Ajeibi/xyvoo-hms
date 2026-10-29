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
        meaning="care"
        subtitle="Coordinate work orders, planned servicing, and room recovery from one maintenance dashboard."
        settingsHref={`/hms/${slug}/maintenance/settings`}
        comingSoon="Maintenance isn't ready yet. Work orders and planned servicing are on the way. For now, block a room for repairs from Rooms on the front desk."
      />
    </HMSLayout>
  );
}
