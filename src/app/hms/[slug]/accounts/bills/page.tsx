import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listVendorBills } from "@/lib/hms/vendor-bills";
import { listVendors } from "@/lib/hms/procurement-vendors";
import { AccountsVendorBillsClient } from "@/components/hms/accounts/AccountsVendorBillsClient";

export default async function AccountsVendorBillsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-bills">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Vendor bills</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
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
      />
    </HMSLayout>
  );
}
