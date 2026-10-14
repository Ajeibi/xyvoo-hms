import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { ProcurementReportsClient } from "@/components/hms/procurement/ProcurementReportsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { getSpendByCategory, getSpendByDepartment, getSpendByVendor, getVendorPerformanceReport } from "@/lib/hms/procurement-reports";

export default async function ProcurementReportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let spendByVendor: Awaited<ReturnType<typeof getSpendByVendor>> = [];
  let spendByDepartment: Awaited<ReturnType<typeof getSpendByDepartment>> = [];
  let spendByCategory: Awaited<ReturnType<typeof getSpendByCategory>> = [];
  let vendorPerformance: Awaited<ReturnType<typeof getVendorPerformanceReport>> = [];
  let currency = "NGN";

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [spendByVendor, spendByDepartment, spendByCategory, vendorPerformance] = await Promise.all([
      getSpendByVendor(supabase, tenant.id),
      getSpendByDepartment(supabase, tenant.id),
      getSpendByCategory(supabase, tenant.id),
      getVendorPerformanceReport(supabase, tenant.id),
    ]);
    currency = normalizePricingSetup(tenant.pricing_setup).currency;
  }

  return (
    <HMSLayout slug={slug} requiredSection="procurement-reports">
      <HmsPage wide>
        <HmsPageHeader eyebrow="Procurement" meaning="stock" title="Reports" description="Spend and vendor performance across every purchase order that has left draft." />
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementReportsClient
          spendByVendor={spendByVendor}
          spendByDepartment={spendByDepartment}
          spendByCategory={spendByCategory}
          vendorPerformance={vendorPerformance}
          currency={currency}
        />
      </HmsPage>
    </HMSLayout>
  );
}
