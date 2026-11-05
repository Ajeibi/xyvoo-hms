import type { SupabaseClient } from "@supabase/supabase-js";
import { loadConnection, loadMaps, type ChannelConnection, type RateMap, type RoomMap } from "./sync";

/* Everything the Channels screen shows, in one read. */

export type InboxItem = {
  id: string;
  kind: "new" | "modified" | "cancelled";
  channelName: string;
  status: "received" | "applied" | "needs_attention" | "ignored";
  message: string | null;
  bookingRef: string;
  reservationIds: string[];
  createdAt: string;
  guest: string;
  arrival: string | null;
  departure: string | null;
};

export type OutboxSummary = { pending: number; failed: number; sentLastDay: number; lastSentAt: string | null; lastError: string | null };

export type ChannelProduction = { channel: string; bookings: number; nights: number; revenue: number; cancelled: number };

export type ChannelStatus = {
  connection: ChannelConnection | null;
  rooms: RoomMap[];
  rates: RateMap[];
  outbox: OutboxSummary;
  inbox: InboxItem[];
  needAttention: number;
  production: ChannelProduction[];
};

export async function loadChannelStatus(db: SupabaseClient, tenantId: string): Promise<ChannelStatus> {
  const connection = await loadConnection(db, tenantId);
  const maps = await loadMaps(db, tenantId);
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const [pending, failed, sent, lastSent, lastFailed, inbox, attention, prod] = await Promise.all([
    db.schema("hotel").from("channel_outbox").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "pending"),
    db.schema("hotel").from("channel_outbox").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "failed"),
    db.schema("hotel").from("channel_outbox").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "sent").gte("sent_at", dayAgo),
    db.schema("hotel").from("channel_outbox").select("sent_at").eq("tenant_id", tenantId).eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle(),
    db.schema("hotel").from("channel_outbox").select("last_error").eq("tenant_id", tenantId).in("status", ["failed", "pending"]).not("last_error", "is", null).order("id", { ascending: false }).limit(1).maybeSingle(),
    db.schema("hotel").from("channel_inbox").select("id,kind,channel_name,status,message,booking_ref,reservation_ids,created_at,normalized").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(40),
    db.schema("hotel").from("channel_inbox").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "needs_attention"),
    db
      .schema("hotel")
      .from("reservations")
      .select("channel_name,status,nights,channel_amount,total_room_charges")
      .eq("tenant_id", tenantId)
      .not("channel_booking_ref", "is", null)
      .gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
      .limit(5000),
  ]);

  const byChannel = new Map<string, ChannelProduction>();
  for (const r of prod.data ?? []) {
    const name = (r.channel_name as string | null) ?? "Booking site";
    const row = byChannel.get(name) ?? { channel: name, bookings: 0, nights: 0, revenue: 0, cancelled: 0 };
    if (r.status === "cancelled") row.cancelled += 1;
    else {
      row.bookings += 1;
      row.nights += Number(r.nights) || 0;
      row.revenue += Number(r.channel_amount) || Number(r.total_room_charges) || 0;
    }
    byChannel.set(name, row);
  }

  return {
    connection,
    rooms: maps.rooms,
    rates: maps.rates,
    outbox: {
      pending: pending.count ?? 0,
      failed: failed.count ?? 0,
      sentLastDay: sent.count ?? 0,
      lastSentAt: (lastSent.data?.sent_at as string | undefined) ?? null,
      lastError: (lastFailed.data?.last_error as string | undefined) ?? null,
    },
    inbox: (inbox.data ?? []).map((i) => {
      const n = (i.normalized ?? {}) as { guest?: { firstName?: string; lastName?: string }; arrival?: string; departure?: string };
      return {
        id: i.id as string,
        kind: i.kind as InboxItem["kind"],
        channelName: (i.channel_name as string | null) ?? "Booking site",
        status: i.status as InboxItem["status"],
        message: (i.message as string | null) ?? null,
        bookingRef: i.booking_ref as string,
        reservationIds: (i.reservation_ids as string[]) ?? [],
        createdAt: i.created_at as string,
        guest: [n.guest?.firstName, n.guest?.lastName].filter(Boolean).join(" "),
        arrival: n.arrival ?? null,
        departure: n.departure ?? null,
      };
    }),
    needAttention: attention.count ?? 0,
    production: [...byChannel.values()].sort((a, b) => b.revenue - a.revenue),
  };
}
