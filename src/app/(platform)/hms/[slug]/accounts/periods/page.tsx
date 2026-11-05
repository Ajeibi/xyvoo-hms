import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listPeriods } from "@/lib/hms/accounting-periods";
import { listYearEnds } from "@/lib/hms/year-end-close";
import { AccountsPeriodsClient } from "@/components/hms/accounts/AccountsPeriodsClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsPeriodsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-periods">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Period close" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const today = new Date().toISOString().slice(0, 10);
  const [periods, yearEnds] = await Promise.all([listPeriods(service, tenant.id), listYearEnds(service, tenant.id, today)]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-periods">
      <AccountsPeriodsClient
        slug={slug}
        periods={periods}
        yearEnds={yearEnds}
        today={today}
        canClose={caps.canClosePeriod}
        canReopen={caps.canReopenPeriod}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
