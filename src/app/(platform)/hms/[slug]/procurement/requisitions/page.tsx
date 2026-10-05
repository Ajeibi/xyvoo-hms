import HMSLayout from "@/components/hms/HMSLayout";
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
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Requisitions</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Approved requests from Inventory and Admin/GM waiting to be sourced. Procurement cannot raise a requisition —
          only Inventory or an Admin/GM can.
        </p>
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementRequisitionsInboxClient slug={slug} lines={lines} />
      </div>
    </HMSLayout>
  );
}
