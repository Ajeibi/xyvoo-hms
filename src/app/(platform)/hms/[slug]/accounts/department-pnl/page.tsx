import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getDepartmentPnl } from "@/lib/hms/department-pnl";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsDepartmentPnlClient } from "@/components/hms/accounts/AccountsDepartmentPnlClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsDepartmentPnlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-department-pnl">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Department profit and loss" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-department-pnl">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Department profit and loss" description="You don't have access to this report." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const now = new Date();
  const dateFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const dateTo = now.toISOString().slice(0, 10);
  const result = await getDepartmentPnl(createServerSupabaseClient(), tenant.id, { dateFrom, dateTo });

  return (
    <HMSLayout slug={slug} requiredSection="accounts-department-pnl">
      <AccountsDepartmentPnlClient
        slug={slug}
        initialResult={result}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        currency={normalizePricingSetup(tenant.pricing_setup).currency}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
