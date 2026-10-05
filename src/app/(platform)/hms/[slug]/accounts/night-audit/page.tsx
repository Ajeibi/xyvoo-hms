import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listNightAuditRuns } from "@/lib/hms/night-audit";
import { AccountsNightAuditClient } from "@/components/hms/accounts/AccountsNightAuditClient";

export default async function AccountsNightAuditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-night-audit">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Night audit</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const runs = await listNightAuditRuns(service, tenant.id);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-night-audit">
      <AccountsNightAuditClient
        slug={slug}
        runs={runs}
        canRun={caps.canRunNightAudit}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
