import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
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
      <HmsPage>
        <HmsPageHeader eyebrow="Procurement" meaning="stock" title="Procurement settings" description="Vendor categories, approval thresholds and quality checklists for each item type." />
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementSettingsClient slug={slug} categories={categories} thresholds={thresholds} checklists={checklists} itemTypes={itemTypes} />
      </HmsPage>
    </HMSLayout>
  );
}
