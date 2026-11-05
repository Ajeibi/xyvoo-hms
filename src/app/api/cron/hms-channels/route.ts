import { NextResponse } from "next/server";
import { getProvider } from "@/lib/hms/channels/adapters";
import { loadChannelTenant, runChannelCycle } from "@/lib/hms/channels/service";
import { queueSync, type ChannelConnection } from "@/lib/hms/channels/sync";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

/**
 * GET /api/cron/hms-channels: run daily by Vercel Cron (see vercel.json); run it every few minutes
 * if the plan allows. For each connected hotel it
 *   1. fetches any booking messages the webhook missed and places them,
 *   2. sends changed availability, rates and restrictions,
 *   3. once a day, sends everything again, in the early hours, as the channel manager asks.
 * Vercel sends "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provider = getProvider();
  if (!provider.isConfigured()) return NextResponse.json({ ok: true, skipped: "no channel manager key on the server" });

  const db = createServerSupabaseClient();
  const { data } = await db.schema("hotel").from("channel_connections").select("*").eq("provider", provider.id).eq("status", "active");
  const totals = { hotels: 0, received: 0, needAttention: 0, sent: 0, failed: 0, errors: 0 };
  const dayAgo = Date.now() - 20 * 3_600_000;

  for (const conn of (data ?? []) as ChannelConnection[]) {
    totals.hotels += 1;
    try {
      // The nightly full sync (at most once a day) catches anything a missed change left behind.
      if (!conn.last_full_sync_at || new Date(conn.last_full_sync_at).getTime() < dayAgo) {
        const tenant = await loadChannelTenant(db, conn.tenant_id);
        if (tenant) await queueSync(db, tenant, { full: true, reason: "nightly full sync" });
      }
      const r = await runChannelCycle(db, conn, provider);
      totals.received += r.polled?.received ?? 0;
      totals.needAttention += r.polled?.needAttention ?? 0;
      totals.sent += r.sent;
      totals.failed += r.failed;
      if (r.error) totals.errors += 1;
    } catch (e) {
      totals.errors += 1;
      console.warn("[hms-channels]", conn.tenant_id, e);
    }
  }
  return NextResponse.json({ ok: true, ...totals });
}
