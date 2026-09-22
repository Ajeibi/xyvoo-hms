import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getUserStoreDashboardPath } from "@/lib/auth/redirects";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const errorDescription = url.searchParams.get("error_description");

  if (errorDescription) {
    const loginUrl = new URL("/auth/login/storefront", url.origin);
    loginUrl.searchParams.set("error", errorDescription);
    return NextResponse.redirect(loginUrl);
  }

  if (!code) {
    return NextResponse.redirect(new URL("/auth/login/storefront", url.origin));
  }

  const supabase = await createSupabaseAuthServerClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    const loginUrl = new URL("/auth/login/storefront", url.origin);
    loginUrl.searchParams.set("error", error?.message || "Failed to complete Google sign-in.");
    return NextResponse.redirect(loginUrl);
  }

  const storeDashboardPath = await getUserStoreDashboardPath(data.user.id);
  return NextResponse.redirect(new URL(storeDashboardPath || "/register/storefront/complete", url.origin));
}
