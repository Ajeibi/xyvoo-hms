import HMSLayout from "@/components/hms/HMSLayout";
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
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Budgets</h1>
        <p className="mt-0.5 text-sm text-slate-500">Department spend against budget, drawn from approved-and-later purchase orders.</p>
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementBudgetsClient slug={slug} budgets={budgets} currency={currency} />
      </div>
    </HMSLayout>
  );
}
