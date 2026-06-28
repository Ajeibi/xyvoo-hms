import DepartmentDashboardScaffold from "@/components/hms/DepartmentDashboardScaffold";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function RevenuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="revenue">
      <DepartmentDashboardScaffold
        title="Revenue"
        subtitle="Monitor pricing performance, pacing, and revenue-control tasks from a focused revenue workspace."
        settingsHref={`/hms/${slug}/revenue/settings`}
        highlights={[
          { label: "Active rate plans", value: "5", detail: "Rate plans currently published or ready for sale." },
          { label: "Alerts", value: "2", detail: "Pricing or occupancy signals that need review today." },
          { label: "Forecast tasks", value: "3", detail: "Open follow-ups around pacing, restrictions, or yields." },
        ]}
      />
    </HMSLayout>
  );
}
