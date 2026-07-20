import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskGuestServicesClient } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServicesClient";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import { listGuestServiceCategories } from "@/lib/hms/guest-service-categories";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function FrontDeskGuestServicesPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ q?: string }>;
}) {
  const { slug } = await params;
  const sp = searchParams ? await searchParams : {};
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);

  const capabilities = getGuestServicesCapabilities({
    membershipRole: access.role ?? "staff",
    departmentRole: access.departmentRole,
  });

  const categories = tenant
    ? await listGuestServiceCategories(createServerSupabaseClient(), tenant.id, { activeOnly: true })
    : [];

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskGuestServicesClient
        slug={slug}
        tenantId={tenant?.id ?? ""}
        capabilities={capabilities}
        initialSearch={sp.q ?? ""}
        categories={categories}
      />
    </HMSLayout>
  );
}
