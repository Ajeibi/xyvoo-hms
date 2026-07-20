import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DiscountScope } from "@/lib/hms/walk-in-pricing";
import type { AccompanyingAdultGuest, MinorGuest } from "@/lib/hms/walk-in-check-in-payload";

export type CheckInFormInitialData = {
  title: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  nationality: string;
  idType: "passport" | "national_id" | "drivers_license";
  idNumber: string;
  idExpiryDate: string;
  dateOfBirth: string;
  arrivalDate: string;
  arrivalTime: string;
  departureDate: string;
  departureTime: string;
  adults: number;
  children: number;
  infants: number;
  additionalAdults: AccompanyingAdultGuest[];
  childGuests: MinorGuest[];
  infantGuests: MinorGuest[];
  purposeOfVisit: "leisure" | "business" | "transit";
  roomTypeCode: string;
  roomCode: string | null;
  discountPercent: number;
  discountScope: DiscountScope;
  taxExemptVat: boolean;
  taxExemptServiceCharge: boolean;
  taxExemptStateLevy: boolean;
  taxExemptStampLevy: boolean;
  taxExemptionReason: string | null;
  taxExemptionDocRef: string | null;
  settlementMethod: "cash" | "card" | "pos" | "split" | "direct_bill" | "partial_credit";
  settlementType: string | null;
  cardLast4: string | null;
  cardExpiry: string | null;
  billToAccount: string | null;
  poNumber: string | null;
  preauthAmount: number | null;
  guestRemarksReservation: string | null;
  guestRemarksCheckIn: string | null;
  guestRemarksCheckOut: string | null;
  guaranteeReleaseDate: string | null;
  minPaymentPerDayToExtend: number | null;
  seasonCode: string | null;
  rateType: "rack" | "corporate" | "walk_in_bar" | "promotional";
  marketSegment: "transient" | "corporate" | "group" | "government" | "wholesale";
  source: "walk_in" | "phone" | "referral" | "ota" | "website" | "travel_agent";
  bookingChannel: string | null;
  travelAgentName: string | null;
  commissionPlan: string | null;
  commissionValue: number | null;
  voucherNumber: string | null;
  showRateOnRegistrationCard: boolean;
  generateBill: boolean;
  rateOverridden: boolean;
  rateOverrideReason: string | null;
  immigrationRegistrationRequired: boolean;
  vipFlag: boolean;
};

type GuestFullRow = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  nationality: string;
  id_type: "passport" | "national_id" | "drivers_license";
  id_number: string;
  id_expiry_date: string;
  date_of_birth: string;
};

const GUEST_SELECT = "id,title,first_name,last_name,phone,email,nationality,id_type,id_number,id_expiry_date,date_of_birth";

function ymd(iso: string) {
  return iso.slice(0, 10);
}

function hhmm(iso: string) {
  return iso.slice(11, 16);
}

function guestTitleToPayload(title: string | null): AccompanyingAdultGuest["title"] {
  const t = title?.trim().toLowerCase();
  if (t === "mr" || t === "mrs" || t === "ms" || t === "dr" || t === "chief" || t === "other") return t;
  return null;
}

/** Loads an existing "confirmed" reservation's full guest/stay/billing detail, shaped to seed
 * FrontDeskCheckInForm's fields — completing check-in reuses the exact same rich form instead of
 * re-collecting data that was already captured when the reservation was booked. */
export async function getCheckInFormInitialData(
  tenantId: string,
  reservationId: string,
): Promise<{
  initialData: CheckInFormInitialData;
  confirmationCode: string;
  guestName: string;
  status: string;
} | null> {
  const supabase = createServerSupabaseClient();

  const { data: reservation } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      `id,confirmation_code,status,arrival_at,departure_at,adults,purpose_of_visit,room_type_code,room_unit_id,
       rate_type,season_code,rate_overridden,rate_override_reason,show_rate_on_registration_card,
       tax_exemption_reason,tax_exemption_doc_ref,settlement_method,preauth_amount,bill_to_account,po_number,
       min_payment_per_day,booking_channel,market_segment,source,travel_agent_name,commission_plan,commission_value,
       voucher_number,vip_flag,generate_bill,immigration_registration_required,pricing_snapshot,remarks_by_phase,
       guarantee_release_date,reservation_guests(is_primary,relationship,guests(${GUEST_SELECT}))`,
    )
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();

  if (!reservation) return null;

  const links = (reservation.reservation_guests ?? []) as unknown as {
    is_primary: boolean;
    relationship: string | null;
    guests: GuestFullRow | GuestFullRow[] | null;
  }[];

  const guestOf = (l: (typeof links)[number]) => (Array.isArray(l.guests) ? (l.guests[0] ?? null) : l.guests);

  const primaryLink = links.find((l) => l.is_primary) ?? links[0];
  const primary = primaryLink ? guestOf(primaryLink) : null;
  if (!primary) return null;

  let roomCode: string | null = null;
  if (reservation.room_unit_id) {
    const { data: unit } = await supabase
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .eq("id", reservation.room_unit_id)
      .maybeSingle();
    roomCode = (unit?.room_code as string | undefined) ?? null;
  }

  const additionalAdults: AccompanyingAdultGuest[] = links
    .filter((l) => l !== primaryLink && l.relationship === "adult")
    .map(guestOf)
    .filter((g): g is GuestFullRow => Boolean(g))
    .map((g) => ({
      title: guestTitleToPayload(g.title),
      firstName: g.first_name,
      lastName: g.last_name,
      phone: g.phone,
      email: g.email,
      nationality: g.nationality,
      idType: g.id_type,
      idNumber: g.id_number,
      idExpiryDate: g.id_type === "national_id" ? null : ymd(g.id_expiry_date),
      dateOfBirth: ymd(g.date_of_birth),
    }));

  const minorGuestsOf = (relationship: "child" | "infant"): MinorGuest[] =>
    links
      .filter((l) => l !== primaryLink && l.relationship === relationship)
      .map(guestOf)
      .filter((g): g is GuestFullRow => Boolean(g))
      .map((g) => ({
        firstName: g.first_name,
        lastName: g.last_name,
        dateOfBirth: ymd(g.date_of_birth),
        nationality: g.nationality,
      }));

  const snapshot = (reservation.pricing_snapshot ?? {}) as Record<string, unknown>;
  const taxExemptions = (snapshot.taxExemptions ?? {}) as Record<string, unknown>;
  const settlementSnapshot = (snapshot.settlement ?? {}) as Record<string, unknown>;
  const remarksByPhase = (reservation.remarks_by_phase ?? {}) as Record<string, unknown>;

  const initialData: CheckInFormInitialData = {
    title: primary.title,
    firstName: primary.first_name,
    lastName: primary.last_name,
    phone: primary.phone,
    email: primary.email,
    nationality: primary.nationality,
    idType: primary.id_type,
    idNumber: primary.id_number,
    idExpiryDate: primary.id_type === "national_id" ? "" : ymd(primary.id_expiry_date),
    dateOfBirth: ymd(primary.date_of_birth),
    arrivalDate: ymd(reservation.arrival_at as string),
    arrivalTime: hhmm(reservation.arrival_at as string),
    departureDate: ymd(reservation.departure_at as string),
    departureTime: hhmm(reservation.departure_at as string),
    adults: reservation.adults as number,
    children: minorGuestsOf("child").length,
    infants: minorGuestsOf("infant").length,
    additionalAdults,
    childGuests: minorGuestsOf("child"),
    infantGuests: minorGuestsOf("infant"),
    purposeOfVisit: reservation.purpose_of_visit as CheckInFormInitialData["purposeOfVisit"],
    roomTypeCode: reservation.room_type_code as string,
    roomCode,
    discountPercent: typeof snapshot.discountPercent === "number" ? snapshot.discountPercent : 0,
    discountScope: (snapshot.discountScope as DiscountScope | undefined) ?? "none",
    taxExemptVat: Boolean(taxExemptions.vat),
    taxExemptServiceCharge: Boolean(taxExemptions.serviceCharge),
    taxExemptStateLevy: Boolean(taxExemptions.stateLevy),
    taxExemptStampLevy: Boolean(taxExemptions.stampLevy),
    taxExemptionReason: reservation.tax_exemption_reason as string | null,
    taxExemptionDocRef: reservation.tax_exemption_doc_ref as string | null,
    settlementMethod: reservation.settlement_method as CheckInFormInitialData["settlementMethod"],
    settlementType: (settlementSnapshot.settlementType as string | null | undefined) ?? null,
    cardLast4: (settlementSnapshot.cardLast4 as string | null | undefined) ?? null,
    cardExpiry: (settlementSnapshot.cardExpiry as string | null | undefined) ?? null,
    billToAccount: reservation.bill_to_account as string | null,
    poNumber: reservation.po_number as string | null,
    preauthAmount: reservation.preauth_amount as number | null,
    guestRemarksReservation: (remarksByPhase.reservation as string | undefined) || null,
    guestRemarksCheckIn: (remarksByPhase.check_in as string | undefined) || null,
    guestRemarksCheckOut: (remarksByPhase.check_out as string | undefined) || null,
    guaranteeReleaseDate: reservation.guarantee_release_date as string | null,
    minPaymentPerDayToExtend: reservation.min_payment_per_day as number | null,
    seasonCode: reservation.season_code as string | null,
    rateType: reservation.rate_type as CheckInFormInitialData["rateType"],
    marketSegment: reservation.market_segment as CheckInFormInitialData["marketSegment"],
    source: reservation.source as CheckInFormInitialData["source"],
    bookingChannel: reservation.booking_channel as string | null,
    travelAgentName: reservation.travel_agent_name as string | null,
    commissionPlan: reservation.commission_plan as string | null,
    commissionValue: reservation.commission_value as number | null,
    voucherNumber: reservation.voucher_number as string | null,
    showRateOnRegistrationCard: reservation.show_rate_on_registration_card as boolean,
    generateBill: reservation.generate_bill as boolean,
    rateOverridden: reservation.rate_overridden as boolean,
    rateOverrideReason: reservation.rate_override_reason as string | null,
    immigrationRegistrationRequired: reservation.immigration_registration_required as boolean,
    vipFlag: reservation.vip_flag as boolean,
  };

  const guestName = `${primary.first_name} ${primary.last_name}`.trim();

  return {
    initialData,
    confirmationCode: reservation.confirmation_code as string,
    guestName,
    status: reservation.status as string,
  };
}
