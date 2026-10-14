import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { ProcurementRequisitionsInboxClient } from "@/components/hms/procurement/ProcurementRequisitionsInboxClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listSourceableRequisitionLines } from "@/lib/hms/procurement-orders";

export default async function ProcurementRequisitionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let lines: Awaited<ReturnType<typeof listSourceableRequisitionLines>> = [];
  if (tenant) {
    const supabase = createServerSupabaseClient();
    lines = await listSourceableRequisitionLines(supabase, tenant.id);
  }

  return (
    <HMSLayout slug={slug} requiredSection="procurement-requisitions">
      <HmsPage>
        <HmsPageHeader
          eyebrow="Procurement"
          meaning="stock"
          title="Requisitions"
          description="Approved requests from Inventory and Admin/GM waiting to be sourced. Only Inventory or an Admin/GM can raise a requisition."
        />
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementRequisitionsInboxClient slug={slug} lines={lines} />
      </HmsPage>
    </HMSLayout>
  );
}
