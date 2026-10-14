import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getArAgingReport } from "@/lib/hms/customer-invoices";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { AccountsArAgingClient } from "@/components/hms/accounts/AccountsArAgingClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsArAgingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ar-aging">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="AR ageing" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-ar-aging">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="AR ageing" description="You don't have access to this report." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const rows = await getArAgingReport(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-ar-aging">
      <AccountsArAgingClient slug={slug} rows={rows} canAccessAllDepartments={access.canAccessAllDepartments} />
    </HMSLayout>
  );
}
