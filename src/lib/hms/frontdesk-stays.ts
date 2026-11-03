import { createServerSupabaseClient } from "@/lib/supabase/server";
import { countChildrenJson } from "@/lib/hms/reservation-metrics";

export type StaysView = "in-house" | "unpaid";

export type InHouseStayRow = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
  roomCode: string | null;
  isVip: boolean;
  guests: number;
  arrivalAt: string;
  departureAt: string;
  isOverdue: boolean;
  balance: number;
  /** A payment or deposit is on the bill. Direct-bill stays are billed later, so they never count as unpaid. */
  unpaid: boolean;
};

/** A stay owes the desk a first payment: in house, billed to the guest, nothing paid or deposited yet. */
export function isUnpaidStay(stay: { status: string; settlement_method: string | null }, hasPayment: boolean): boolean {
  return stay.status === "checked_in" && stay.settlement_method !== "direct_bill" && !hasPayment;
}

type StayQueryRow = {
  id: string;
  confirmation_code: string;
  arrival_at: string;
  departure_at: string;
  room_unit_id: string | null;
  vip_flag: boolean;
  settlement_method: string | null;
  adults: number;
  children_json: unknown;
  reservation_guests:
    | {
        is_primary: boolean;
        guests: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
      }[]
    | null;
  folio_transactions: { kind: string; amount: number | string; voided_at: string | null }[] | null;
};

function guestNameFor(r: StayQueryRow) {
  const primary = r.reservation_guests?.find((e) => e.is_primary) ?? r.reservation_guests?.[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest";
}

/** Every guest staying now, soonest departure first. Same rules as the dashboard's in-house and unpaid tiles. */
export async function getInHouseStays(tenantId: string): Promise<InHouseStayRow[]> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      "id,confirmation_code,arrival_at,departure_at,room_unit_id,vip_flag,settlement_method,adults,children_json,reservation_guests(is_primary,guests(first_name,last_name)),folio_transactions!folio_transactions_reservation_id_fkey(kind,amount,voided_at)",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "checked_in")
    .order("departure_at", { ascending: true })
    .limit(500);
  if (error) throw new Error(error.message);

  const stays = (data ?? []) as unknown as StayQueryRow[];

  const roomUnitIds = [...new Set(stays.map((s) => s.room_unit_id).filter((id): id is string => Boolean(id)))];
  const { data: units } = roomUnitIds.length
    ? await supabase.schema("hotel").from("room_units").select("id,room_code").in("id", roomUnitIds)
    : { data: [] as { id: string; room_code: string }[] };
  const roomCodeById = new Map((units ?? []).map((u) => [u.id as string, u.room_code as string]));

  const now = Date.now();
  return stays.map((s) => {
    const lines = (s.folio_transactions ?? []).filter((l) => !l.voided_at);
    const hasPayment = lines.some((l) => l.kind === "payment");
    return {
      reservationId: s.id,
      confirmationCode: s.confirmation_code,
      guestName: guestNameFor(s),
      roomCode: s.room_unit_id ? roomCodeById.get(s.room_unit_id) ?? null : null,
      isVip: Boolean(s.vip_flag),
      guests: s.adults + countChildrenJson(s.children_json),
      arrivalAt: s.arrival_at,
      departureAt: s.departure_at,
      isOverdue: new Date(s.departure_at).getTime() < now,
      balance: lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0),
      unpaid: isUnpaidStay({ status: "checked_in", settlement_method: s.settlement_method }, hasPayment),
    };
  });
}
