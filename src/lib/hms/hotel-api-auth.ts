import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";

export async function requireHotelApiMember(slug: string) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return { error: "Tenant not found." as const, status: 404 as const };

  const service = createServerSupabaseClient();
  const { data: membership } = await service
    .schema("hotel")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership) return { error: "Forbidden" as const, status: 403 as const };

  return { user, tenant, service, role: membership.role as string };
}
