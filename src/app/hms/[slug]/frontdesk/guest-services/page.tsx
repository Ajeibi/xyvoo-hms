import HMSLayout from "@/components/hms/HMSLayout";
import { FrontDeskGuestServicesClient } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServicesClient";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
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
  const tenant = await getHotelTenantBySlug(slug);

  let capabilities = getGuestServicesCapabilities("Front Desk");
  let tenantId = tenant?.id ?? "";

  if (tenant?.id) {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();
    if (user) {
      const service = createServerSupabaseClient();
      const { data: membership } = await service
        .schema("hotel")
        .from("memberships")
        .select("role")
        .eq("tenant_id", tenant.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (membership?.role) {
        capabilities = getGuestServicesCapabilities(membership.role as string);
      }
    }
  }

  return (
    <HMSLayout slug={slug} requiredSection="frontdesk">
      <FrontDeskGuestServicesClient
        slug={slug}
        tenantId={tenantId}
        capabilities={capabilities}
        initialSearch={sp.q ?? ""}
      />
    </HMSLayout>
  );
}
