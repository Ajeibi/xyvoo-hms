import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { AccountsExportsClient } from "@/components/hms/accounts/AccountsExportsClient";

export default async function AccountsExportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const access = await getHmsAccessContext(slug);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-exports">
      <AccountsExportsClient slug={slug} today={today} canAccessAllDepartments={access.canAccessAllDepartments} />
    </HMSLayout>
  );
}
