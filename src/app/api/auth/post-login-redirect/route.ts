import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getUserHotelDashboardPath, isPlatformAdminEmail } from "@/lib/auth/redirects";

export async function POST(req: Request) {
  const supabase = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { from?: string };
  const requestedFrom = typeof body.from === "string" ? body.from : "";

  if (isPlatformAdminEmail(user.email)) {
    return NextResponse.json({ redirectTo: requestedFrom || "/admin" });
  }

  const hotelDashboardPath = await getUserHotelDashboardPath(user.id);
  return NextResponse.json({ redirectTo: hotelDashboardPath || "/register" });
}
