import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { ProcurementOrderDetailClient } from "@/components/hms/procurement/ProcurementOrderDetailClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getPurchaseOrderById } from "@/lib/hms/procurement-orders";

export default async function ProcurementOrderDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  if (!tenant) notFound();

  const supabase = createServerSupabaseClient();
  const order = await getPurchaseOrderById(supabase, tenant.id, id);
  if (!order) notFound();

  return (
    <HMSLayout slug={slug} requiredSection="procurement-orders">
      <ProcurementOrderDetailClient slug={slug} order={order} canApprove={access.canAccessAllDepartments} />
    </HMSLayout>
  );
}
