import DepartmentDashboardScaffold from "@/components/hms/DepartmentDashboardScaffold";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function ProcurementPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="procurement">
      <DepartmentDashboardScaffold
        title="Procurement"
        subtitle="Manage suppliers, purchase requests, and approvals from a dedicated procurement workspace."
        settingsHref={`/hms/${slug}/procurement/settings`}
        highlights={[
          { label: "Pending requests", value: "8", detail: "Purchase requests waiting on approval or supplier action." },
          { label: "Open POs", value: "3", detail: "Purchase orders still in-flight or partially delivered." },
          { label: "Supplier alerts", value: "2", detail: "Deliveries or supplier responses that need follow-up." },
        ]}
      />
    </HMSLayout>
  );
}
