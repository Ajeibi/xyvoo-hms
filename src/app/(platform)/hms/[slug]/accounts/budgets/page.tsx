import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getBudgetGrid, getBudgetReport } from "@/lib/hms/account-budgets";
import { AccountsBudgetsClient } from "@/components/hms/accounts/AccountsBudgetsClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsBudgetsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-budgets">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Budgets" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const now = new Date();
  const year = now.getFullYear();
  const dateFrom = `${year}-01-01`;
  const dateTo = now.toISOString().slice(0, 10);
  const [report, grid] = await Promise.all([
    getBudgetReport(service, tenant.id, { dateFrom, dateTo }),
    getBudgetGrid(service, tenant.id, year),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-budgets">
      <AccountsBudgetsClient
        slug={slug}
        initialReport={report}
        initialGrid={grid}
        initialYear={year}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        canEdit={caps.canManageChartOfAccounts}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
