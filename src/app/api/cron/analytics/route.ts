import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/cron/analytics — run daily by Vercel Cron (see vercel.json). Saves
 * the last two days' totals (so a late-arriving event is still counted), then
 * deletes raw events and abandoned-checkout details older than 28 days.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = createServerSupabaseClient().schema("store");
  const today = new Date();
  const days = [1, 2].map((ago) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - ago)).toISOString().slice(0, 10));

  for (const day of days) {
    const { error } = await store.rpc("rollup_daily_stats", { p_day: day });
    if (error) return NextResponse.json({ error: `Rollup failed for ${day}: ${error.message}` }, { status: 500 });
  }
  const { error: purgeError } = await store.rpc("purge_old_analytics");
  if (purgeError) return NextResponse.json({ error: `Purge failed: ${purgeError.message}` }, { status: 500 });

  return NextResponse.json({ ok: true, rolledUp: days });
}
