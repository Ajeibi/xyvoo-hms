import type { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getFolioForReservation, getTenantFolioSettings } from "@/lib/hms/folio";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";

export type FolioAuth = Exclude<Awaited<ReturnType<typeof requireHotelApiMember>>, { error: string }>;

type ReservationGuestEmbed = {
  is_primary: boolean;
  guests:
    | { first_name: string; last_name: string }
    | { first_name: string; last_name: string }[]
    | null;
}[] | null;

function guestNameFrom(reservationGuests: ReservationGuestEmbed) {
  const primary = reservationGuests?.find((e) => e.is_primary) ?? reservationGuests?.[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest";
}

export async function loadReservation(
  auth: FolioAuth,
  reservationId: string,
) {
  const { data, error } = await auth.service
    .schema("hotel")
    .from("reservations")
    .select(
      "id,confirmation_code,folio_number,status,settlement_method,preauth_amount,total_room_charges,rate_per_night,room_type_code,nights,bill_to_account,po_number,folio_split_notes,commission_plan,commission_value,reservation_guests(is_primary,guests(first_name,last_name))",
    )
    .eq("id", reservationId)
    .eq("tenant_id", auth.tenant.id)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function loadFolioPayload(auth: FolioAuth, reservationId: string) {
  const reservation = await loadReservation(auth, reservationId);
  if (!reservation) return null;
  const folio = await getFolioForReservation(auth.service, auth.tenant.id, reservationId, {
    settlementMethod: reservation.settlement_method,
    preauthAmount: reservation.preauth_amount != null ? Number(reservation.preauth_amount) : null,
    totalRoomCharges: Number(reservation.total_room_charges),
    status: reservation.status,
  });
  const settings = await getTenantFolioSettings(auth.service, auth.tenant.id);
  const roomTypes = normalizeRoomTypes(auth.tenant.room_types);
  const roomTypeName = roomTypes.find((rt) => rt.id === reservation.room_type_code)?.name ?? null;
  const guestName = guestNameFrom(reservation.reservation_guests as ReservationGuestEmbed);
  return { reservation, folio, settings, roomTypeName, guestName };
}
