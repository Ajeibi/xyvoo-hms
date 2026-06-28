import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function InventorySettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="inventory-settings">
      <ModuleScaffold
        title="Inventory Settings"
        subtitle="Adjust stock handling, reorder logic, and inventory dashboard preferences."
        checklist={[
          "Store locations and stock movement rules",
          "Reorder thresholds and low-stock alerts",
          "Issue, return, and variance controls",
          "Cycle count frequency and approval flow",
          "Inventory dashboard cards and notifications",
        ]}
      />
    </HMSLayout>
  );
}
