import type { SupabaseClient } from "@supabase/supabase-js";

/* What the staff screen for website bookings shows: bookings made on the website, requests waiting for a reply, and visitors who left. */

export type WebBookingRowView = {
  id: string;
  code: string;
  guest: string;
  email: string | null;
  roomTypeCode: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  status: string;
  cancelledByGuest: boolean;
  depositRequired: number;
  depositPaid: number;
  createdAt: string;
};

type GuestEmbed = { first_name: string; last_name: string; email: string | null };

export async function listWebBookings(db: SupabaseClient, tenantId: string, limit = 100): Promise<WebBookingRowView[]> {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,confirmation_code,status,arrival_at,departure_at,nights,room_type_code,pricing_snapshot,total_room_charges,deposit_required,created_at,web_cancelled_by_guest,reservation_guests(is_primary,guests(first_name,last_name,email))")
    .eq("tenant_id", tenantId)
    .eq("source", "website")
    .order("created_at", { ascending: false })
    .limit(limit);
  const rows = data ?? [];
  const ids = rows.map((r) => r.id as string);
  const paid = new Map<string, number>();
  if (ids.length) {
    const { data: deps } = await db.schema("hotel").from("reservation_deposits").select("reservation_id,amount,status").eq("tenant_id", tenantId).in("reservation_id", ids);
    for (const d of deps ?? []) {
      if (d.status === "refunded") continue;
      paid.set(d.reservation_id as string, (paid.get(d.reservation_id as string) ?? 0) + (Number(d.amount) || 0));
    }
  }
  return rows.map((r) => {
    const links = (r.reservation_guests ?? []) as { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[];
    const primary = links.find((l) => l.is_primary) ?? links[0];
    const g = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
    const snap = (r.pricing_snapshot ?? {}) as { taxes?: { grandTotal?: number } };
    return {
      id: r.id as string,
      code: r.confirmation_code as string,
      guest: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest",
      email: g?.email ?? null,
      roomTypeCode: r.room_type_code as string,
      checkIn: (r.arrival_at as string).slice(0, 10),
      checkOut: (r.departure_at as string).slice(0, 10),
      nights: Number(r.nights) || 1,
      total: Number(snap.taxes?.grandTotal) > 0 ? Number(snap.taxes!.grandTotal) : Number(r.total_room_charges) || 0,
      status: r.status as string,
      cancelledByGuest: Boolean(r.web_cancelled_by_guest),
      depositRequired: Number(r.deposit_required) || 0,
      depositPaid: Math.round((paid.get(r.id as string) ?? 0) * 100) / 100,
      createdAt: r.created_at as string,
    };
  });
}

export type WebRequestRow = { id: string; reference: string; guest: string; email: string; phone: string; room: string; checkIn: string; checkOut: string; status: string; createdAt: string };

export async function listWebRequests(db: SupabaseClient, tenantId: string, limit = 50): Promise<WebRequestRow[]> {
  const { data } = await db
    .schema("hotel")
    .from("booking_requests")
    .select("id,reference,status,check_in,check_out,room_type,guest_first_name,guest_last_name,guest_email,guest_phone,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    reference: r.reference as string,
    guest: `${r.guest_first_name} ${r.guest_last_name}`.trim(),
    email: r.guest_email as string,
    phone: r.guest_phone as string,
    room: r.room_type as string,
    checkIn: r.check_in as string,
    checkOut: r.check_out as string,
    status: r.status as string,
    createdAt: r.created_at as string,
  }));
}

export type WebAbandonedRow = { id: string; email: string; firstName: string | null; checkIn: string | null; checkOut: string | null; roomType: string | null; status: string; remindedAt: string | null; startedAt: string };

export async function listWebAbandoned(db: SupabaseClient, tenantId: string, limit = 50): Promise<WebAbandonedRow[]> {
  const { data } = await db
    .schema("hotel")
    .from("website_booking_sessions")
    .select("id,email,first_name,check_in,check_out,room_type,status,reminder_sent_at,created_at")
    .eq("tenant_id", tenantId)
    .in("status", ["started", "reminded", "expired"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: (r.email as string | null) ?? "",
    firstName: (r.first_name as string | null) ?? null,
    checkIn: (r.check_in as string | null) ?? null,
    checkOut: (r.check_out as string | null) ?? null,
    roomType: (r.room_type as string | null) ?? null,
    status: r.status as string,
    remindedAt: (r.reminder_sent_at as string | null) ?? null,
    startedAt: r.created_at as string,
  }));
}
