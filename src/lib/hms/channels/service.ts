import type { SupabaseClient } from "@supabase/supabase-js";
import { getProvider } from "./adapters";
import { pollBookings, receiveBooking } from "./inbound";
import { drainOutbox, loadConnection, queueSync, type ChannelConnection, type ChannelTenant } from "./sync";
import type { ChannelProvider } from "./types";

/* What the webhook, the cron and the staff buttons share. */

export async function loadChannelTenant(db: SupabaseClient, tenantId: string): Promise<ChannelTenant | null> {
  const { data } = await db.from("tenants").select("id,room_types,pricing_setup").eq("id", tenantId).maybeSingle();
  return (data as ChannelTenant | null) ?? null;
}

/** Everything for one hotel: pick up new bookings, queue changed nights, send them. Never throws. */
export async function runChannelCycle(db: SupabaseClient, conn: ChannelConnection, provider: ChannelProvider = getProvider()) {
  const out = { polled: null as null | { received: number; needAttention: number }, queued: 0, sent: 0, failed: 0, waiting: 0, error: null as string | null };
  try {
    const tenant = await loadChannelTenant(db, conn.tenant_id);
    if (!tenant || conn.status !== "active") return out;
    const polled = await pollBookings(db, provider, conn, tenant);
    if (polled.ok) out.polled = { received: polled.received, needAttention: polled.needAttention };
    else out.error = polled.error;
    // Bookings just applied have already noted their nights, so the queue below includes them.
    const queued = await queueSync(db, tenant, { reason: "changes" });
    if (queued.ok) out.queued = queued.calls;
    else out.error = out.error ?? queued.error;
    const fresh = (await loadConnection(db, conn.tenant_id)) ?? conn;
    const drained = await drainOutbox(db, provider, fresh);
    out.sent = drained.sent;
    out.failed = drained.failed;
    out.waiting = drained.waiting;
  } catch (e) {
    out.error = e instanceof Error ? e.message : "The channel cycle failed.";
  }
  return out;
}

export { receiveBooking };
