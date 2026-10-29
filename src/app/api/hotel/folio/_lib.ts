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
import { loadWindows, planWindowBilling, routeFor, summariseWindows } from "@/lib/hms/folio-windows";
import { commissionFor } from "@/lib/hms/folio-commission";
import { creditLimitState } from "@/lib/hms/folio-credit-limits";

export type FolioAuth = Exclude<Awaited<ReturnType<typeof requireHotelApiMember>>, { error: string }>;

type ReservationGuestEmbed = {
  is_primary: boolean;
  guests:
    | { first_name: string; last_name: string; email?: string | null; phone?: string | null; whatsapp?: string | null }
    | { first_name: string; last_name: string; email?: string | null; phone?: string | null; whatsapp?: string | null }[]
    | null;
}[] | null;

function guestEmailFrom(reservationGuests: ReservationGuestEmbed) {
  const primary = reservationGuests?.find((e) => e.is_primary) ?? reservationGuests?.[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest?.email ?? null;
}

function guestPhoneFrom(reservationGuests: ReservationGuestEmbed) {
  const primary = reservationGuests?.find((e) => e.is_primary) ?? reservationGuests?.[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest?.whatsapp || guest?.phone || null;
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
      "id,confirmation_code,folio_number,status,settlement_method,preauth_amount,total_room_charges,rate_per_night,room_type_code,nights,departure_at,arrival_at,checked_in_at,rate_overridden,rate_override_reason,vat_applicable,tax_exempt,pricing_snapshot,extra_nights_confirmed_on,travel_agent_vendor_id,agent_commission_percent,commission_bill_id,bill_to_account,po_number,folio_split_notes,commission_plan,commission_value,credit_limit,reservation_guests(is_primary,guests(first_name,last_name,email,phone,whatsapp))",
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
  const guestPhone = guestPhoneFrom(reservation.reservation_guests as ReservationGuestEmbed);
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
  const billing = await buildBilling(auth, reservationId, folio.lines, guestName, stay);
  const agent = await buildAgent(auth, reservation, folio.lines);
  const credit = {
    ...creditLimitState(folio.lines, reservation.credit_limit != null ? Number(reservation.credit_limit) : null, settings.defaultCreditLimit),
    stayLimit: reservation.credit_limit != null ? Number(reservation.credit_limit) : null,
    defaultLimit: settings.defaultCreditLimit,
  };
  return { reservation, folio, settings, roomTypeName, guestName, guestEmail, guestPhone, extraNights, stay, billing, agent, credit };
}

/** The stay's travel agent and their commission so far (final at check-out). */
async function buildAgent(
  auth: FolioAuth,
  reservation: { travel_agent_vendor_id?: string | null; agent_commission_percent?: number | string | null; commission_bill_id?: string | null },
  lines: Parameters<typeof commissionFor>[0],
) {
  if (!reservation.travel_agent_vendor_id) return null;
  const { data: v } = await auth.service.schema("hotel").from("vendors").select("name").eq("tenant_id", auth.tenant.id).eq("id", reservation.travel_agent_vendor_id).maybeSingle();
  const percent = Number(reservation.agent_commission_percent) || 0;
  const { base, amount } = commissionFor(lines, percent);
  return {
    id: reservation.travel_agent_vendor_id,
    name: (v?.name as string | undefined) ?? "Travel agent",
    percent,
    base,
    commission: amount,
    billed: Boolean(reservation.commission_bill_id),
  };
}

/**
 * Who pays what: each window's payer and balance, and what check-out will do. A window linked
 * to a company account is billed to it; everything else is due from the guest now. The early
 * check-out credit (posted at check-out) lands on whichever window the room charges go to.
 */
async function buildBilling(
  auth: FolioAuth,
  reservationId: string,
  lines: Parameters<typeof summariseWindows>[0],
  guestName: string,
  stay: ReturnType<typeof buildStaySummary>,
) {
  const { payers, rules } = await loadWindows(auth.service, auth.tenant.id, reservationId);
  const windows = summariseWindows(lines, payers, guestName);
  const plan = planWindowBilling(windows);
  const credit = stay.earlyCheckout && !stay.earlyCheckout.applied ? stay.earlyCheckout.credit : 0;
  const creditWindow = routeFor(rules, "rooms") ?? "guest";
  const creditOnAccount = plan.toAccounts.some((w) => w.window === creditWindow);
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    windows,
    rules,
    toAccounts: plan.toAccounts.map((w) => ({
      window: w.window,
      payerName: w.payerName,
      accountName: w.arCustomerName,
      amount: round(w.balance - (creditOnAccount && w.window === creditWindow ? credit : 0)),
    })),
    dueNow: round(plan.dueNow - (creditOnAccount ? 0 : credit)),
  };
}
