import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { AccountsIntegrationsClient } from "@/components/hms/accounts/AccountsIntegrationsClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsIntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-integrations">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Integrations" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-integrations">
      <AccountsIntegrationsClient
        slug={slug}
        today={today}
        canManage={caps.canManageIntegrations}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
