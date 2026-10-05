import { redirect } from "next/navigation";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getUserHotelDashboardPath, isPlatformAdminEmail } from "@/lib/auth/redirects";

export default async function TenantsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?from=/tenants");
  }

  if (!isPlatformAdminEmail(user.email)) {
    const hotelDashboardPath = await getUserHotelDashboardPath(user.id);
    redirect(hotelDashboardPath || "/auth/login");
  }

  return children;
}
