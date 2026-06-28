import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function ProcurementSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="procurement-settings">
      <ModuleScaffold
        title="Procurement Settings"
        subtitle="Set procurement approvals, supplier defaults, and purchasing workflow rules."
        checklist={[
          "Supplier categories and preferred vendors",
          "Approval thresholds and approver chain",
          "Purchase request and PO numbering rules",
          "Receiving and discrepancy handling",
          "Procurement dashboard alerts and reminders",
        ]}
      />
    </HMSLayout>
  );
}
