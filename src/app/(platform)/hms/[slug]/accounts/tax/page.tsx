import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getTaxYear } from "@/lib/hms/tax-reports";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsTaxClient } from "@/components/hms/accounts/AccountsTaxClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsTaxPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-tax">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Tax reports" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const year = new Date().getFullYear();
  const report = await getTaxYear(createServerSupabaseClient(), tenant.id, year);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-tax">
      <AccountsTaxClient
        slug={slug}
        initialYear={year}
        initialReport={report}
        currency={normalizePricingSetup(tenant.pricing_setup).currency}
        canEdit={caps.canManageChartOfAccounts}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
