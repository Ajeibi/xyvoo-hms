import HMSLayout from "@/components/hms/HMSLayout";
import ModuleScaffold from "@/components/hms/ModuleScaffold";

export default async function AccountsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="accounts">
      <ModuleScaffold
        title="Accounts"
        subtitle="Configure billing, ledgers, and financial controls."
        checklist={[
          "Chart of accounts and posting rules",
          "Invoice numbering and tax settings",
          "Payment methods and settlement accounts",
          "Credit control and approval limits",
          "Daily revenue and cashier close process",
        ]}
      />
    </HMSLayout>
  );
}
