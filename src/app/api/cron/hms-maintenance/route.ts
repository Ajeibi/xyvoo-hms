import { NextResponse } from "next/server";
import { alertOverdueOrders } from "@/lib/hms/maintenance-orders";
import { generateDueSchedules } from "@/lib/hms/maintenance-schedules";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * GET /api/cron/hms-maintenance: run daily by Vercel Cron (see vercel.json). For each hotel it
 *   1. makes the work orders for planned maintenance that has come due, and
 *   2. alerts maintenance staff about open orders past their target time (once a day each).
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServerSupabaseClient();
  const { data } = await db.schema("hotel").from("maintenance_work_orders").select("tenant_id").limit(5000);
  const { data: sched } = await db.schema("hotel").from("maintenance_schedules").select("tenant_id").eq("active", true).limit(5000);
  const tenants = [...new Set([...(data ?? []), ...(sched ?? [])].map((r) => (r as { tenant_id: string }).tenant_id))];

  const totals = { hotels: 0, ordersMade: 0, overdueAlerts: 0, errors: 0 };
  for (const tenantId of tenants) {
    totals.hotels++;
    try {
      totals.ordersMade += await generateDueSchedules(db, tenantId);
      totals.overdueAlerts += await alertOverdueOrders(db, tenantId);
    } catch (e) {
      totals.errors++;
      console.warn("[hms-maintenance cron]", tenantId, e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
