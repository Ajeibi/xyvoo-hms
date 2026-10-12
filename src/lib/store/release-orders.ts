import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * Card orders hold stock for 30 minutes. Unpaid and failed ones are released
 * by store.release_expired_orders: every shop from the cron job, and each
 * shop again when it is visited (at most once a minute per server), so stock
 * comes back promptly even where cron jobs only run daily.
 */

const RECENT_MS = 60_000;
const lastRun = new Map<string, number>();

export async function releaseExpiredOrders(tenantId: string | null = null) {
  const { data, error } = await createServerSupabaseClient()
    .schema("store")
    .rpc("release_expired_orders", { p_tenant_id: tenantId, p_limit: 500 });
  if (error) throw new Error(error.message);
  return Number(data) || 0;
}

/** Fire-and-forget release for one shop, skipped if this server ran it in the last minute. */
export function releaseExpiredOrdersSoon(tenantId: string) {
  const now = Date.now();
  if (now - (lastRun.get(tenantId) ?? 0) < RECENT_MS) return;
  lastRun.set(tenantId, now);
  // After the response, so the shopper never waits on it.
  after(() =>
    releaseExpiredOrders(tenantId).catch(() => {
      // Not there yet (migration pending) or a blip: the cron job will catch up.
    }),
  );
}
