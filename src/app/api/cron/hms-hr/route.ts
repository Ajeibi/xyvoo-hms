import { NextResponse } from "next/server";
import { alertMissingStaff, alertNoShowsAndOpenEntries } from "@/lib/hms/hr/hr-time";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * GET /api/cron/hms-hr: run daily by Vercel Cron (see vercel.json). For each hotel with staff it
 *   1. sends a morning summary of yesterday's no-shows and clock-ins left open, and
 *   2. checks for anyone late for a shift that has already started.
 * Lateness is also checked through the day whenever the clock screen or the HR dashboard is used.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServerSupabaseClient();
  const { data } = await db.schema("hotel").from("hr_employees").select("tenant_id").eq("status", "active").limit(20000);
  const tenants = [...new Set((data ?? []).map((r) => (r as { tenant_id: string }).tenant_id))];

  const totals = { hotels: 0, summaries: 0, lateAlerts: 0, errors: 0 };
  for (const tenantId of tenants) {
    totals.hotels++;
    try {
      totals.summaries += await alertNoShowsAndOpenEntries(db, tenantId);
      totals.lateAlerts += await alertMissingStaff(db, tenantId);
    } catch (e) {
      totals.errors++;
      console.warn("[hms-hr cron]", tenantId, e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
