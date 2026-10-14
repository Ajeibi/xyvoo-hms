import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { ProcurementOrderFormClient, type PrefillManualLine } from "@/components/hms/procurement/ProcurementOrderFormClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { listVendors } from "@/lib/hms/procurement-vendors";
import { listSourceableRequisitionLines } from "@/lib/hms/procurement-orders";

export default async function NewPurchaseOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    lines?: string;
    reorderItemId?: string;
    reorderItemName?: string;
    reorderSku?: string;
    reorderQty?: string;
    reorderUnitCost?: string;
  }>;
}) {
  const { slug } = await params;
  const {
    lines: preselectedParam,
    reorderItemId,
    reorderItemName,
    reorderSku,
    reorderQty,
    reorderUnitCost,
  } = await searchParams;

  const prefillManualLine: PrefillManualLine | undefined =
    reorderItemId && reorderItemName
      ? {
          itemId: reorderItemId,
          description: reorderSku ? `${reorderItemName} (${reorderSku})` : reorderItemName,
          quantity: Number(reorderQty) || 1,
          unitCost: Number(reorderUnitCost) || 0,
        }
      : undefined;

  let vendors: Awaited<ReturnType<typeof listVendors>> = [];
  let sourceableLines: Awaited<ReturnType<typeof listSourceableRequisitionLines>> = [];
  let currency = "NGN";

  const tenant = await getHotelTenantBySlug(slug);
  if (tenant) {
    const supabase = createServerSupabaseClient();
    [vendors, sourceableLines] = await Promise.all([
      listVendors(supabase, tenant.id, { status: ["active", "preferred"] }),
      listSourceableRequisitionLines(supabase, tenant.id),
    ]);
    currency = normalizePricingSetup(tenant.pricing_setup).currency;
  }

  const preselectedLineIds = preselectedParam ? preselectedParam.split(",").filter(Boolean) : [];

  return (
    <HMSLayout slug={slug} requiredSection="procurement-orders">
      <HmsPage>
        <HmsPageHeader eyebrow="Procurement" meaning="stock" title="New purchase order" description="Source against approved requisitions, or create a manual PO with a documented reason." />
        <ProcurementOrderFormClient
          slug={slug}
          vendors={vendors}
          sourceableLines={sourceableLines}
          preselectedLineIds={preselectedLineIds}
          defaultCurrency={currency}
          prefillManualLine={prefillManualLine}
        />
      </HmsPage>
    </HMSLayout>
  );
}
