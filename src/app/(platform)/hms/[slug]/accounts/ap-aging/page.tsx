import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getApAgingReport } from "@/lib/hms/vendor-bill-payments";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { AccountsApAgingClient } from "@/components/hms/accounts/AccountsApAgingClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsApAgingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ap-aging">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="AP ageing" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ap-aging">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="AP ageing" description="You don't have access to this report." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const rows = await getApAgingReport(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-ap-aging">
      <AccountsApAgingClient slug={slug} rows={rows} canAccessAllDepartments={access.canAccessAllDepartments} />
    </HMSLayout>
  );
}
