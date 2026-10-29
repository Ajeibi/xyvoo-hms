import DepartmentDashboardScaffold from "@/components/hms/DepartmentDashboardScaffold";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function RevenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="revenue">
      <DepartmentDashboardScaffold
        title="Revenue"
        meaning="money"
        subtitle="Monitor pricing performance, pacing, and revenue-control tasks from a focused revenue workspace."
        settingsHref={`/hms/${slug}/revenue/settings`}
        comingSoon="Revenue isn't ready yet. Rate plans, seasonal prices and forecasts are on the way. Room prices are still set in Settings, and today's takings are on the dashboard."
      />
    </HMSLayout>
  );
}
