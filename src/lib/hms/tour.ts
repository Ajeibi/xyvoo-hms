import { createSupabaseAuthServerClient, getSessionUser } from "@/lib/supabase/auth-server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import type { HotelDashboardTourStatus, HotelProfileTourStatusRow } from "@/types";

export async function getDashboardTourStatus(slug: string): Promise<HotelDashboardTourStatus> {
  const user = await getSessionUser();
  if (!user) return "pending";
  const auth = await createSupabaseAuthServerClient();

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return "pending";

  if (tenant.hms_dashboard_tour_hidden === true) {
    return "skipped";
  }

  const { data: profile } = await auth
    .schema("hotel")
    .from("profiles")
    .select("dashboard_tour_status")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle();

  return (profile as HotelProfileTourStatusRow | null)?.dashboard_tour_status ?? "pending";
}
