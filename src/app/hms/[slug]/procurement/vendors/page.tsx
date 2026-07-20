import HMSLayout from "@/components/hms/HMSLayout";
import { ProcurementSubNav } from "@/components/hms/procurement/ProcurementSubNav";
import { ProcurementVendorsClient } from "@/components/hms/procurement/ProcurementVendorsClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getHmsAccessContext } from "@/lib/hms/access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listVendorCategories, listVendors } from "@/lib/hms/procurement-vendors";

export default async function ProcurementVendorsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  let vendors: Awaited<ReturnType<typeof listVendors>> = [];
  let categories: Awaited<ReturnType<typeof listVendorCategories>> = [];
  if (tenant) {
    const supabase = createServerSupabaseClient();
    [vendors, categories] = await Promise.all([listVendors(supabase, tenant.id), listVendorCategories(supabase, tenant.id)]);
  }

  return (
    <HMSLayout slug={slug} requiredSection="procurement-vendors">
      <div className="px-8 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Vendors</h1>
        <p className="mt-0.5 text-sm text-slate-500">The approved-vendor register — status, certifications, and category.</p>
        <ProcurementSubNav slug={slug} canAccessAllDepartments={access.canAccessAllDepartments} />
        <ProcurementVendorsClient slug={slug} vendors={vendors} categories={categories} />
      </div>
    </HMSLayout>
  );
}
