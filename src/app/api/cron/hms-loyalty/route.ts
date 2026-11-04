import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncLoyaltyEarnings } from "@/lib/hms/guest-loyalty";

/**
 * GET /api/cron/hms-loyalty: run daily by Vercel Cron (see vercel.json). Credits loyalty points for every
 * finished stay that hasn't earned yet, in each hotel that has loyalty switched on.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const service = createServerSupabaseClient();
  const totals = { hotels: 0, stays: 0, points: 0, failed: 0 };
  const { data: enabled, error } = await service.schema("hotel").from("loyalty_settings").select("tenant_id").eq("enabled", true);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  for (const row of enabled ?? []) {
    try {
      const r = await syncLoyaltyEarnings(service, row.tenant_id as string);
      totals.hotels += 1;
      totals.stays += r.credited;
      totals.points += r.points;
    } catch (e) {
      totals.failed += 1;
      console.warn("[hms-loyalty]", row.tenant_id, e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
