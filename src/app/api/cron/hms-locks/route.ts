import { NextResponse } from "next/server";
import { emitNotification } from "@/lib/hms/front-desk-ops";
import { refreshLockBatteries, retryFailedRevokes, sweepExpiredCodes } from "@/lib/hms/integrations/locks/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * GET /api/cron/hms-locks: run daily by Vercel Cron (see vercel.json); run it more often if the plan allows.
 * For each hotel with a lock system connected it
 *   1. tries again to cancel any door code the lock refused to cancel at check-out,
 *   2. cancels codes still live a day after their stay ended,
 *   3. reads every lock's battery and alerts staff about low ones.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createServerSupabaseClient();
  const { data } = await db.schema("hotel").from("integration_connections").select("tenant_id").eq("kind", "lock").neq("status", "paused");
  const totals = { hotels: 0, cancelled: 0, stillFailing: 0, lowBatteries: 0, errors: 0 };

  for (const row of (data ?? []) as { tenant_id: string }[]) {
    totals.hotels++;
    try {
      const retried = await retryFailedRevokes(db, row.tenant_id);
      const swept = await sweepExpiredCodes(db, row.tenant_id);
      totals.cancelled += retried.revoked + swept.revoked;
      const failing = retried.failed + swept.failed;
      totals.stillFailing += failing;
      if (failing > 0) {
        await emitNotification({
          tenantId: row.tenant_id,
          type: "door_code_not_cancelled",
          title: "A door code could not be cancelled",
          body: `${failing} door code(s) for guests who have left are still live at the lock. Check the lock connection in Settings, Door locks.`,
          severity: "warning",
          entityType: "lock_integration",
          entityId: row.tenant_id,
        });
      }
      const batteries = await refreshLockBatteries(db, row.tenant_id);
      totals.lowBatteries += batteries.low.length;
      if (batteries.low.length > 0) {
        await emitNotification({
          tenantId: row.tenant_id,
          type: "lock_battery_low",
          title: "Door lock batteries are low",
          body: `${batteries.low.length} lock(s) are at ${Math.max(...batteries.low.map((l) => l.battery))}% or less. Change the batteries soon so guests are not locked out.`,
          severity: "warning",
          entityType: "lock_integration",
          entityId: row.tenant_id,
        });
      }
    } catch (e) {
      totals.errors++;
      console.error("[cron hms-locks]", row.tenant_id, e instanceof Error ? e.message : e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
