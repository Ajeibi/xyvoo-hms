import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { ProcurementVendorDetailClient } from "@/components/hms/procurement/ProcurementVendorDetailClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { getVendorById, getVendorScorecard, listVendorCategories, listVendorPriceCatalog } from "@/lib/hms/procurement-vendors";
import { listPurchaseOrders } from "@/lib/hms/procurement-orders";
import { listItems } from "@/lib/hms/inventory-items";

export default async function ProcurementVendorDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) notFound();

  const supabase = createServerSupabaseClient();
  const vendor = await getVendorById(supabase, tenant.id, id);
  if (!vendor) notFound();

  const [categories, priceCatalog, scorecard, allOrders, items] = await Promise.all([
    listVendorCategories(supabase, tenant.id),
    listVendorPriceCatalog(supabase, tenant.id, id),
    getVendorScorecard(supabase, tenant.id, id),
    listPurchaseOrders(supabase, tenant.id, { limit: 200 }),
    listItems(supabase, tenant.id, { activeOnly: true }),
  ]);

  const orders = allOrders.filter((o) => o.vendor_id === id);
  const currency = normalizePricingSetup(tenant.pricing_setup).currency;

  return (
    <HMSLayout slug={slug} requiredSection="procurement-vendors">
      <ProcurementVendorDetailClient
        slug={slug}
        vendor={vendor}
        categories={categories}
        priceCatalog={priceCatalog}
        scorecard={scorecard}
        orders={orders}
        items={items}
        currency={currency}
      />
    </HMSLayout>
  );
}
