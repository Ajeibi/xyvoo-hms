import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { listNightAuditRuns } from "@/lib/hms/night-audit";
import { getBusinessDate } from "@/lib/hms/business-date";
import { getNightAuditSettings } from "@/lib/hms/night-audit-settings";
import { AccountsNightAuditClient } from "@/components/hms/accounts/AccountsNightAuditClient";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";

export default async function AccountsNightAuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-night-audit">
        <HmsPage wide>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Night audit" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const [runs, business, settings] = await Promise.all([
    listNightAuditRuns(service, tenant.id),
    getBusinessDate(service, tenant.id),
    getNightAuditSettings(service, tenant.id),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-night-audit">
      <AccountsNightAuditClient
        slug={slug}
        runs={runs}
        business={business}
        settings={settings}
        canRun={caps.canRunNightAudit}
        canChangeSettings={isAdminLikeRole(access.role ?? null)}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
