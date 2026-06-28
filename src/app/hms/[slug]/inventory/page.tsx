import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function InventoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="inventory">
      <ModuleScaffold
        title="Inventory"
        subtitle="Configure stock controls for rooms, restaurant, and maintenance."
        checklist={[
          "Store locations and stock categories",
          "Suppliers and purchase workflows",
          "Item units, reorder levels, and alerts",
          "Issue/return policies by department",
          "Stock count cycle and variance handling",
        ]}
      />
    </HMSLayout>
  );
}
