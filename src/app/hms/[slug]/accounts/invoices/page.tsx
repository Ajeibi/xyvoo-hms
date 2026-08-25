import HMSLayout from "@/components/hms/HMSLayout";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listCustomerInvoices } from "@/lib/hms/customer-invoices";
import { listArCustomers } from "@/lib/hms/ar-customers";
import { AccountsCustomerInvoicesClient } from "@/components/hms/accounts/AccountsCustomerInvoicesClient";

export default async function AccountsCustomerInvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-invoices">
        <div className="px-8 py-8">
          <h1 className="text-xl font-semibold text-slate-900">Customer invoices</h1>
          <p className="mt-0.5 text-sm text-slate-500">Hotel not found.</p>
        </div>
      </HMSLayout>
    );
  }

  const caps = getAccountsCapabilities({ membershipRole: access.role ?? "staff", departmentRole: access.departmentRole });
  const service = createServerSupabaseClient();
  const [invoices, accounts, customers] = await Promise.all([
    listCustomerInvoices(service, tenant.id),
    listChartOfAccounts(service, tenant.id, { activeOnly: true }),
    listArCustomers(service, tenant.id, { status: ["active"] }),
  ]);

  return (
    <HMSLayout slug={slug} requiredSection="accounts-invoices">
      <AccountsCustomerInvoicesClient
        slug={slug}
        invoices={invoices}
        accounts={accounts}
        customers={customers}
        canCreate={caps.canCreateCustomerInvoice}
        canManageCustomers={caps.canManageArCustomers}
        canReceivePayment={caps.canReceivePayment}
        canAccessAllDepartments={access.canAccessAllDepartments}
      />
    </HMSLayout>
  );
}
