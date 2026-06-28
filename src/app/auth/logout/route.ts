import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

export async function POST(request: Request) {
  const supabase = await createSupabaseAuthServerClient();
  await supabase.auth.signOut();
  const url = new URL("/auth/login", request.url);
  return NextResponse.redirect(url);
}
