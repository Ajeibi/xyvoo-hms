import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function RevenueSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="revenue-settings">
      <ModuleScaffold
        title="Revenue Settings"
        subtitle="Adjust pricing control rules, forecast defaults, and revenue dashboard preferences."
        checklist={[
          "Rate strategy groups and pricing triggers",
          "Restriction defaults and release rules",
          "Forecast windows and review cadence",
          "Yield alerts and approval thresholds",
          "Revenue dashboard highlights and alerts",
        ]}
      />
    </HMSLayout>
  );
}
