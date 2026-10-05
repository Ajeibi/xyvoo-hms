import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getIncomeStatement } from "@/lib/hms/financial-statements";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsIncomeStatementClient } from "@/components/hms/accounts/AccountsIncomeStatementClient";

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
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Income statement</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  if (!caps.canViewReports) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-income-statement">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Income statement</h1>
          <p className="mt-0.5 text-sm text-slate-500">You don&apos;t have access to this report.</p>
        </div>
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
