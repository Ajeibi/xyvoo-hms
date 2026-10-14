import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { ProcurementBudgetsClient } from "@/components/hms/procurement/ProcurementBudgetsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { listBudgets } from "@/lib/hms/procurement-budgets";

export default async function ProcurementBudgetsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let budgets: Awaited<ReturnType<typeof listBudgets>> = [];
  let currency = "NGN";
  if (tenant) {
    const supabase = createServerSupabaseClient();
    budgets = await listBudgets(supabase, tenant.id);
    currency = normalizePricingSetup(tenant.pricing_setup).currency;
  }

  return (
    <HMSLayout slug={slug} requiredSection="procurement-budgets">
      <HmsPage>
        <HmsPageHeader eyebrow="Procurement" meaning="stock" title="Budgets" description="Department spend against budget, drawn from purchase orders once they are approved." />
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementBudgetsClient slug={slug} budgets={budgets} currency={currency} />
      </HmsPage>
    </HMSLayout>
  );
}
