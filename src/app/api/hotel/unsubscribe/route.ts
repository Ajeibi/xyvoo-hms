import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { unsubscribeGuest } from "@/lib/hms/guest-consent";

const TokenSchema = z.string().min(10).max(600);

/**
 * POST /api/hotel/unsubscribe: a guest turns off marketing from the hotel using the private link they were sent.
 * Two ways in: the unsubscribe page posts { token }, and an email app's one-click "Unsubscribe" button
 * posts a plain form to a URL that already carries ?token=.
 */
export async function POST(req: Request) {
  try {
    const fromQuery = new URL(req.url).searchParams.get("token");
    let token: string;
    if (fromQuery) {
      token = TokenSchema.parse(fromQuery);
    } else {
      token = TokenSchema.parse(((await req.json()) as { token?: unknown }).token);
    }
    const result = await unsubscribeGuest(createServerSupabaseClient(), token);
    if (!result.ok) return NextResponse.json({ error: "This link isn't valid." }, { status: 400 });
    return NextResponse.json({ ok: true, hotelName: result.hotelName });
  } catch {
    return NextResponse.json({ error: "This link isn't valid." }, { status: 400 });
  }
}
