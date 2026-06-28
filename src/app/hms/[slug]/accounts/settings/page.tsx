import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function AccountsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="accounts-settings">
      <ModuleScaffold
        title="Accounts Settings"
        subtitle="Manage posting preferences, daily close behavior, and finance team controls."
        checklist={[
          "Posting categories and settlement defaults",
          "Cashier close templates and cut-off time",
          "Approval rules for reversals and adjustments",
          "Tax display and settlement summaries",
          "Accounts dashboard tiles and alerts",
        ]}
      />
    </HMSLayout>
  );
}
