import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const ALLOWED_REDIRECTS = new Set(["/auth/login", "/auth/login/storefront"]);

export async function POST(request: Request) {
  const supabase = await createSupabaseAuthServerClient();
  await supabase.auth.signOut();

  const requested = new URL(request.url).searchParams.get("redirect") || "";
  const destination = ALLOWED_REDIRECTS.has(requested) ? requested : "/auth/login";
  const url = new URL(destination, request.url);
  return NextResponse.redirect(url);
}
