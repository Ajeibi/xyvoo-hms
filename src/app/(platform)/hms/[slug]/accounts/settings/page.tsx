import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listApprovalThresholds } from "@/lib/hms/procurement-orders";
import { AccountsSettingsClient } from "@/components/hms/accounts/AccountsSettingsClient";

export default async function AccountsSettingsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  const thresholds = tenant ? await listApprovalThresholds(createServerSupabaseClient(), tenant.id) : [];

  return (
    <HMSLayout slug={slug} requiredSection="accounts-settings">
      <AccountsSettingsClient slug={slug} thresholds={thresholds} canAccessAllDepartments={access.canAccessAllDepartments} />
    </HMSLayout>
  );
}
