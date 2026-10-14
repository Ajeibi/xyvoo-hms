import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getIncomeStatement } from "@/lib/hms/financial-statements";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsIncomeStatementClient } from "@/components/hms/accounts/AccountsIncomeStatementClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AccountsIncomeStatementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-income-statement">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Income statement" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-income-statement">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Income statement" description="You don't have access to this report." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const service = createServerSupabaseClient();
  const dateFrom = firstOfMonth();
  const dateTo = today();
  const result = await getIncomeStatement(service, tenant.id, { dateFrom, dateTo });
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="accounts-income-statement">
      <AccountsIncomeStatementClient
        slug={slug}
        initialResult={result}
        initialDateFrom={dateFrom}
        initialDateTo={dateTo}
        currency={currency}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
