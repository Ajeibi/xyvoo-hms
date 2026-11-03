import type { SupabaseClient } from "@supabase/supabase-js";
import { parcelNoticeBody, type GuestParcel, type ParcelStatus } from "@/lib/hms/guest-parcels-shared";
import { loadStayRecipient, sendGuestMessages, type MessageChannel, type SendOutcome } from "@/lib/hms/guest-messages";

export * from "@/lib/hms/guest-parcels-shared";

type ParcelRow = {
  id: string;
  reservation_id: string | null;
  recipient_name: string;
  room_code: string | null;
  description: string;
  carrier: string | null;
  tracking_ref: string | null;
  shelf: string | null;
  status: string;
  received_at: string;
  notified_at: string | null;
  notified_channel: string | null;
  collected_by_name: string | null;
  collected_at: string | null;
};

export const PARCEL_COLUMNS =
  "id,reservation_id,recipient_name,room_code,description,carrier,tracking_ref,shelf,status,received_at,notified_at,notified_channel,collected_by_name,collected_at";

export function mapParcel(r: ParcelRow): GuestParcel {
  return {
    id: r.id,
    reservationId: r.reservation_id,
    recipientName: r.recipient_name,
    roomCode: r.room_code,
    description: r.description,
    carrier: r.carrier,
    trackingRef: r.tracking_ref,
    shelf: r.shelf,
    status: (["received", "collected", "returned"] as const).includes(r.status as ParcelStatus) ? (r.status as ParcelStatus) : "received",
    receivedAt: r.received_at,
    notifiedAt: r.notified_at,
    notifiedChannel: r.notified_channel,
    collectedByName: r.collected_by_name,
    collectedAt: r.collected_at,
  };
}

/** Waiting parcels first (oldest first), then the most recent collected ones. Empty if the table isn't there yet. */
export async function loadParcels(db: SupabaseClient, tenantId: string): Promise<GuestParcel[]> {
  const [waiting, done] = await Promise.all([
    db.schema("hotel").from("guest_parcels").select(PARCEL_COLUMNS).eq("tenant_id", tenantId).eq("status", "received").order("received_at", { ascending: true }).limit(200),
    db.schema("hotel").from("guest_parcels").select(PARCEL_COLUMNS).eq("tenant_id", tenantId).neq("status", "received").order("collected_at", { ascending: false, nullsFirst: false }).limit(30),
  ]);
  return [...((waiting.data ?? []) as ParcelRow[]), ...((done.data ?? []) as ParcelRow[])].map(mapParcel);
}

/** Tells the guest a parcel is waiting, by email or a WhatsApp link, and notes when on the parcel. */
export async function notifyParcelGuest(
  db: SupabaseClient,
  params: { tenantId: string; userId: string; parcel: GuestParcel; channel: MessageChannel },
): Promise<SendOutcome | null> {
  if (!params.parcel.reservationId) return null;
  const recipient = await loadStayRecipient(db, params.tenantId, params.parcel.reservationId);
  if (!recipient) return null;
  const [outcome] = await sendGuestMessages(db, {
    tenantId: params.tenantId,
    userId: params.userId,
    channel: params.channel,
    subject: "A parcel is waiting for you",
    body: parcelNoticeBody(params.parcel),
    recipients: [recipient],
    broadcast: false,
  });
  if (outcome && outcome.status !== "failed") {
    await db
      .schema("hotel")
      .from("guest_parcels")
      .update({ notified_at: new Date().toISOString(), notified_channel: params.channel })
      .eq("tenant_id", params.tenantId)
      .eq("id", params.parcel.id);
  }
  return outcome ?? null;
}
