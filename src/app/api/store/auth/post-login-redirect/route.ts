import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getUserStoreDashboardPath } from "@/lib/auth/redirects";

export async function POST() {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeDashboardPath = await getUserStoreDashboardPath(user.id);
  return NextResponse.json({ redirectTo: storeDashboardPath || "/register/storefront" });
}
