import HMSLayout from "@/components/hms/HMSLayout";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { ProcurementSettingsClient } from "@/components/hms/procurement/ProcurementSettingsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listVendorCategories } from "@/lib/hms/procurement-vendors";
import { listApprovalThresholds } from "@/lib/hms/procurement-orders";
import { listQualityChecklists } from "@/lib/hms/procurement-quality";
import { listItemTypes } from "@/lib/hms/inventory-items";

export default async function ProcurementSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let categories: Awaited<ReturnType<typeof listVendorCategories>> = [];
  let thresholds: Awaited<ReturnType<typeof listApprovalThresholds>> = [];
  let checklists: Awaited<ReturnType<typeof listQualityChecklists>> = [];
  let itemTypes: Awaited<ReturnType<typeof listItemTypes>> = [];

  if (tenant) {
    const supabase = createServerSupabaseClient();
    [categories, thresholds, checklists, itemTypes] = await Promise.all([
      listVendorCategories(supabase, tenant.id),
      listApprovalThresholds(supabase, tenant.id),
      listQualityChecklists(supabase, tenant.id),
      listItemTypes(supabase, tenant.id),
    ]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="procurement-settings">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Procurement settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">Vendor categories, approval thresholds, and per-category quality checklists.</p>
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementSettingsClient slug={slug} categories={categories} thresholds={thresholds} checklists={checklists} itemTypes={itemTypes} />
      </div>
    </HMSLayout>
  );
}
