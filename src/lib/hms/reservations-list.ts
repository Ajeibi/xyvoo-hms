import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";

type GuestEmbed = {
  title: string | null;
  first_name: string;
  last_name: string;
};

type ReservationRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  adults: number;
  children_json: unknown;
  room_type_code: string;
  room_unit_id: string | null;
  total_room_charges: number;
  source: string;
  vip_flag: boolean;
  created_at: string;
  reservation_guests: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null;
};

export type ReservationListRow = {
  id: string;
  confirmationCode: string;
  status: "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  guestName: string;
  roomCode: string | null;
  roomTypeName: string;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  partySize: number;
  totalRoomCharges: number;
  source: string;
  vipFlag: boolean;
  createdAt: string;
};

export type ReservationsListSummary = {
  total: number;
  confirmed: number;
  checkedIn: number;
  checkedOut: number;
  cancelledOrNoShow: number;
};

export type ReservationsListPayload = {
  rows: ReservationListRow[];
  summary: ReservationsListSummary;
};

function guestDisplayName(g: GuestEmbed) {
  const title = g.title?.trim();
  const name = `${g.first_name} ${g.last_name}`.trim();
  return title ? `${title} ${name}` : name;
}

function primaryGuestName(r: ReservationRow): string {
  const links = r.reservation_guests ?? [];
  const primary = links.find((l) => l.is_primary) ?? links[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? (g[0] ?? null) : g;
  return guest ? guestDisplayName(guest) : "Guest not linked";
}

function childCount(childrenJson: unknown): number {
  return Array.isArray(childrenJson) ? childrenJson.length : 0;
}

/** All reservations for a tenant regardless of status/date — the "Reservations" list page,
 * distinct from the Arrivals workbench which is scoped to a single day's arrival window. */
export async function getReservationsList(
  tenantId: string,
  roomTypes: HotelRoomTypeSetup[],
): Promise<ReservationsListPayload> {
  const supabase = createServerSupabaseClient();
  const guestSelect = "title,first_name,last_name";

  const [{ data: reservations }, { data: roomUnits }] = await Promise.all([
    supabase
      .schema("hotel")
      .from("reservations")
      .select(
        `id,confirmation_code,status,arrival_at,departure_at,nights,adults,children_json,room_type_code,room_unit_id,total_room_charges,source,vip_flag,created_at,reservation_guests(is_primary,guests(${guestSelect}))`,
      )
      .eq("tenant_id", tenantId)
      .order("arrival_at", { ascending: false }),
    supabase.schema("hotel").from("room_units").select("id,room_code").eq("tenant_id", tenantId),
  ]);

  const roomCodeById = new Map((roomUnits ?? []).map((u) => [u.id as string, u.room_code as string]));
  const typeNameById = new Map(roomTypes.map((t) => [t.id, t.name]));

  const rows: ReservationListRow[] = ((reservations ?? []) as unknown as ReservationRow[]).map((r) => ({
    id: r.id,
    confirmationCode: r.confirmation_code,
    status: r.status as ReservationListRow["status"],
    guestName: primaryGuestName(r),
    roomCode: r.room_unit_id ? (roomCodeById.get(r.room_unit_id) ?? null) : null,
    roomTypeName: typeNameById.get(r.room_type_code) ?? r.room_type_code,
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    nights: r.nights,
    partySize: r.adults + childCount(r.children_json),
    totalRoomCharges: r.total_room_charges,
    source: r.source,
    vipFlag: r.vip_flag,
    createdAt: r.created_at,
  }));

  const summary: ReservationsListSummary = {
    total: rows.length,
    confirmed: rows.filter((r) => r.status === "confirmed").length,
    checkedIn: rows.filter((r) => r.status === "checked_in").length,
    checkedOut: rows.filter((r) => r.status === "checked_out").length,
    cancelledOrNoShow: rows.filter((r) => r.status === "cancelled" || r.status === "no_show").length,
  };

  return { rows, summary };
}
