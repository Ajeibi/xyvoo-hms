import { after, NextResponse } from "next/server";
import { getProvider } from "@/lib/hms/channels/adapters";
import { receiveBooking } from "@/lib/hms/channels/inbound";
import { loadChannelTenant, runChannelCycle } from "@/lib/hms/channels/service";
import type { ChannelConnection } from "@/lib/hms/channels/sync";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 60;

/**
 * POST /api/channels/webhook
 *
 * The channel manager calls this when a booking, change or cancellation arrives. It is signed; an
 * unsigned or stale call gets 401 and nothing is read. The call only says "there is something new":
 * we fetch the message, store it once, acknowledge it, place it, and then send the changed
 * availability back out. Answering 5xx makes the provider try again; the same message twice is harmless.
 */
export async function POST(request: Request) {
  const provider = getProvider();
  const raw = await request.text();
  const verified = provider.verifyWebhook(request.headers, raw);
  if (!verified.ok) return NextResponse.json({ error: verified.error }, { status: 401 });

  const event = provider.parseWebhook(raw);
  if (!event) return NextResponse.json({ error: "Not understood." }, { status: 400 });
  if (!event.externalPropertyId) return NextResponse.json({ ok: true, ignored: "no property" });

  const db = createServerSupabaseClient();
  const { data } = await db.schema("hotel").from("channel_connections").select("*").eq("provider", provider.id).eq("external_property_id", event.externalPropertyId).maybeSingle();
  const conn = data as ChannelConnection | null;
  if (!conn) return NextResponse.json({ ok: true, ignored: "unknown property" });

  if (event.event.startsWith("booking") && event.revisionId && event.event !== "booking_unmapped_room" && event.event !== "booking_unmapped_rate") {
    const tenant = await loadChannelTenant(db, conn.tenant_id);
    if (!tenant) return NextResponse.json({ error: "Hotel not found." }, { status: 500 });
    const one = await provider.fetchOne({ tenantId: conn.tenant_id, externalPropertyId: conn.external_property_id }, event.revisionId);
    if (!one.ok) return NextResponse.json({ error: one.error }, { status: 502 });
    const result = await receiveBooking(db, provider, conn, tenant, one.booking);
    after(() => runChannelCycle(db, conn, provider).then(() => undefined));
    return NextResponse.json({ ok: true, status: result.status, replay: result.replay });
  }

  if (event.event === "sync_error" || event.event === "rate_error" || event.event === "booking_unmapped_room" || event.event === "booking_unmapped_rate") {
    await db
      .schema("hotel")
      .from("channel_connections")
      .update({ last_error: `The channel manager reported: ${event.event.replace(/_/g, " ")}. Check the room and rate matching.`, last_error_at: new Date().toISOString() })
      .eq("id", conn.id);
  }
  return NextResponse.json({ ok: true });
}
