import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listVendorBills } from "@/lib/hms/vendor-bills";
import { listVendors } from "@/lib/hms/procurement-vendors";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsVendorBillsClient } from "@/components/hms/accounts/AccountsVendorBillsClient";

export default async function AccountsVendorBillsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-bills">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Vendor bills" description="Hotel not found." />
        </HmsPage>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const [bills, accounts, vendors] = await Promise.all([
    listVendorBills(service, tenant.id),
    listChartOfAccounts(service, tenant.id, { activeOnly: true }),
    listVendors(service, tenant.id, { status: ["active", "preferred"] }),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-bills">
      <AccountsVendorBillsClient
        slug={slug}
        bills={bills}
        accounts={accounts}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name, currency: v.currency }))}
        canCreate={caps.canCreateVendorBill}
        canApprove={caps.canApproveVendorBill}
        canRecordPayment={caps.canRecordPayment}
        canAccessAllDepartments={access.canAccessAllDepartments}
        defaultCurrency={normalizePricingSetup(tenant.pricing_setup).currency}
      />
    </HMSLayout>
  );
}
