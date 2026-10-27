import type { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getFolioForReservation, getTenantFolioSettings } from "@/lib/hms/folio";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import {
  AUTO_EXTRA_NIGHTS,
  extraNightPricing,
  postExtraNightCharges,
  summariseExtraNights,
  type ExtraNightReservation,
} from "@/lib/hms/folio-extra-nights";
import { buildStaySummary, type StayReservation } from "@/lib/hms/folio-stay-summary";

export type FolioAuth = Exclude<Awaited<ReturnType<typeof requireHotelApiMember>>, { error: string }>;

type ReservationGuestEmbed = {
  is_primary: boolean;
  guests:
    | { first_name: string; last_name: string; email?: string | null }
    | { first_name: string; last_name: string; email?: string | null }[]
    | null;
}[] | null;

function guestEmailFrom(reservationGuests: ReservationGuestEmbed) {
  const primary = reservationGuests?.find((e) => e.is_primary) ?? reservationGuests?.[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest?.email ?? null;
}

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
      "id,confirmation_code,folio_number,status,settlement_method,preauth_amount,total_room_charges,rate_per_night,room_type_code,nights,departure_at,arrival_at,checked_in_at,rate_overridden,rate_override_reason,vat_applicable,tax_exempt,pricing_snapshot,extra_nights_confirmed_on,bill_to_account,po_number,folio_split_notes,commission_plan,commission_value,reservation_guests(is_primary,guests(first_name,last_name,email))",
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
  // An overdue stay's bill keeps growing: charge any extra nights before showing it.
  const pricing = normalizePricingSetup(auth.tenant.pricing_setup);
  const extra = await postExtraNightCharges(auth.service, {
    tenantId: auth.tenant.id,
    reservation: reservation as ExtraNightReservation,
    pricing,
    postedBy: auth.user.id,
  });
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
  const guestEmail = guestEmailFrom(reservation.reservation_guests as ReservationGuestEmbed);
  const charged = summariseExtraNights(folio.lines);
  const extraNights = {
    charged: charged.nights,
    chargedTotal: charged.total,
    waiting: extra.waitingNights.length,
    waitingFrom: extra.waitingNights[0] ?? null,
    waitingTo: extra.waitingNights[extra.waitingNights.length - 1] ?? null,
    nightlyRate: extraNightPricing(reservation as ExtraNightReservation, pricing).nightlyRate,
    autoLimit: AUTO_EXTRA_NIGHTS,
  };
  const stay = buildStaySummary(reservation as StayReservation, folio.lines);
  return { reservation, folio, settings, roomTypeName, guestName, guestEmail, extraNights, stay };
}
