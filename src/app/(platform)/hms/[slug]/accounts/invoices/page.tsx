import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { listChartOfAccounts } from "@/lib/hms/chart-of-accounts";
import { listCustomerInvoices } from "@/lib/hms/customer-invoices";
import { listArCustomers } from "@/lib/hms/ar-customers";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { AccountsCustomerInvoicesClient } from "@/components/hms/accounts/AccountsCustomerInvoicesClient";

export default async function AccountsCustomerInvoicesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [access, tenant] = await Promise.all([getHmsAccessContext(slug), getHotelTenantBySlug(slug)]);

  if (!tenant) {
    return (
      <HMSLayout slug={slug} requiredSection="accounts-invoices">
        <HmsPage>
          <HmsPageHeader eyebrow="Accounts" meaning="money" title="Customer invoices" description="Hotel not found." />
        </HmsPage>
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
        defaultCurrency={normalizePricingSetup(tenant.pricing_setup).currency}
      />
    </HMSLayout>
  );
}
