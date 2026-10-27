import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNigeriaHospitalityTaxes, type NigeriaTaxExemptions } from "@/lib/hms/nigeria-hospitality-taxes";
import { normalizePricingSetup, type HotelPricingSetup } from "@/lib/hms/room-pricing";
import type { FolioLineRow } from "@/lib/hms/folio";

/**
 * A guest still in the room after their departure is charged for each extra night, at the
 * stay's booked rate (after an all-nights discount) with the same taxes and exemptions as the
 * stay. Night D (the departure date) is charged once the stay's departure time passes; each
 * later night once the hotel's check-out time passes that day.
 *
 * Each extra night's lines share the reference `extra_night:<date>:<part>`, and a night that
 * already has any line (voided ones included, so a waived night stays waived) is never posted
 * again. The unique index in `folio_extra_nights.sql` stops two requests posting the same night.
 *
 * Only {@link AUTO_EXTRA_NIGHTS} nights are charged on their own, counted from the departure date
 * or from the last time staff confirmed the guest is still in the room
 * (`reservations.extra_nights_confirmed_on`). Past that the stay is flagged instead, so a guest
 * who left without being checked out in the system doesn't run up months of charges.
 */

export const EXTRA_NIGHT_REF_PREFIX = "extra_night:";
export const AUTO_EXTRA_NIGHTS = 7;
const MAX_EXTRA_NIGHTS = 366;

export function isExtraNightLine(line: Pick<FolioLineRow, "reference">) {
  return Boolean(line.reference?.startsWith(EXTRA_NIGHT_REF_PREFIX));
}

function extraNightDateOf(reference: string | null) {
  if (!reference?.startsWith(EXTRA_NIGHT_REF_PREFIX)) return null;
  return reference.slice(EXTRA_NIGHT_REF_PREFIX.length, EXTRA_NIGHT_REF_PREFIX.length + 10);
}

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Dates of the nights a stay has run past its departure, as of `now`. Times are wall-clock
 * stored as UTC, like every other front desk time.
 */
export function overdueNightDates(departureAt: string, checkOutTime: string, now: Date): string[] {
  const departure = new Date(departureAt);
  if (Number.isNaN(departure.getTime())) return [];
  const departureDate = departure.toISOString().slice(0, 10);
  const [hh, mm] = checkOutTime.split(":").map(Number);

  const dates: string[] = [];
  for (let k = 0; k < MAX_EXTRA_NIGHTS; k += 1) {
    const date = addDays(departureDate, k);
    const cutoff =
      k === 0
        ? departure.getTime()
        : Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), hh || 0, mm || 0);
    if (now.getTime() < cutoff) break;
    dates.push(date);
  }
  return dates;
}

export type ExtraNightReservation = {
  id: string;
  status: string;
  departure_at: string;
  nights: number;
  rate_per_night: number | string | null;
  total_room_charges: number | string | null;
  vat_applicable: boolean | null;
  tax_exempt: boolean | null;
  pricing_snapshot: unknown;
  extra_nights_confirmed_on?: string | null;
};

export const EXTRA_NIGHT_RESERVATION_COLUMNS =
  "id,status,departure_at,nights,rate_per_night,total_room_charges,vat_applicable,tax_exempt,pricing_snapshot,extra_nights_confirmed_on";

/**
 * Splits the nights owed into those charged on their own and those waiting for staff to
 * confirm the guest is still here: nights before the confirmation date, plus
 * {@link AUTO_EXTRA_NIGHTS} nights from the departure date or the confirmation date.
 */
export function splitOwedNights(owed: string[], confirmedOn: string | null | undefined) {
  if (owed.length === 0) return { allowed: [] as string[], waiting: [] as string[] };
  const anchor = confirmedOn && confirmedOn > owed[0] ? confirmedOn : owed[0];
  const lastAllowed = addDays(anchor, AUTO_EXTRA_NIGHTS - 1);
  return {
    allowed: owed.filter((d) => d <= lastAllowed),
    waiting: owed.filter((d) => d > lastAllowed),
  };
}

type Snapshot = {
  nightlyBar?: number;
  discountPercent?: number;
  discountScope?: string;
  taxes?: { serviceChargeRatePercent?: number; stateLevyRatePercent?: number };
  taxExemptions?: { vat?: boolean; serviceCharge?: boolean; stateLevy?: boolean; stampLevy?: boolean };
};

function asSnapshot(value: unknown): Snapshot {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Snapshot) : {};
}

export type ExtraNightPricing = {
  nightlyRate: number;
  nightlyBar: number;
  discountPercent: number;
  serviceChargeRatePercent: number;
  stateLevyRatePercent: number;
  exemptions: NigeriaTaxExemptions;
};

/** The price of one extra night for this stay. */
export function extraNightPricing(reservation: ExtraNightReservation, pricing: HotelPricingSetup): ExtraNightPricing {
  const snap = asSnapshot(reservation.pricing_snapshot);
  const bookedNights = Math.max(1, Number(reservation.nights) || 1);
  const ratePerNight = Number(reservation.rate_per_night) || 0;
  const bookedAverage = (Number(reservation.total_room_charges) || 0) / bookedNights;

  const nightlyBar = Number(snap.nightlyBar) > 0 ? Number(snap.nightlyBar) : ratePerNight || bookedAverage;
  // Only an all-nights discount carries on: a first or last night discount was for those nights.
  const discountPercent =
    snap.discountScope === "all_nights" ? Math.min(100, Math.max(0, Number(snap.discountPercent) || 0)) : 0;
  const nightlyRate =
    Number(snap.nightlyBar) > 0 || ratePerNight > 0
      ? roundMoney(nightlyBar * (1 - discountPercent / 100))
      : roundMoney(bookedAverage);

  const ex = snap.taxExemptions;
  const blanket = reservation.tax_exempt === true;
  return {
    nightlyRate,
    nightlyBar: roundMoney(nightlyBar),
    discountPercent,
    serviceChargeRatePercent: snap.taxes?.serviceChargeRatePercent ?? pricing.serviceChargeRate,
    stateLevyRatePercent: snap.taxes?.stateLevyRatePercent ?? pricing.taxRate,
    exemptions: {
      exemptVat: ex?.vat ?? (blanket || reservation.vat_applicable === false),
      exemptServiceCharge: ex?.serviceCharge ?? blanket,
      exemptStateLevy: ex?.stateLevy ?? blanket,
      exemptStampLevy: true,
    },
  };
}

function formatNight(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function rowsForNight(params: {
  tenantId: string;
  reservationId: string;
  date: string;
  price: ExtraNightPricing;
  currency: string;
  postedBy: string | null;
}) {
  const { price, date } = params;
  const taxes = computeNigeriaHospitalityTaxes({
    roomTaxableBase: price.nightlyRate,
    serviceChargeRatePercent: price.serviceChargeRatePercent,
    stateLevyRatePercent: price.stateLevyRatePercent,
    exemptions: price.exemptions,
  });
  const night = formatNight(date);
  const parts: { part: string; amount: number; description: string }[] = [
    {
      part: "room",
      amount: price.nightlyRate,
      description:
        price.discountPercent > 0
          ? `Extra night, ${night} (stayed past departure, after ${price.discountPercent}% discount)`
          : `Extra night, ${night} (stayed past departure)`,
    },
    {
      part: "service_charge",
      amount: taxes.serviceChargeAmount,
      description: `Service charge on extra night, ${night} (${taxes.serviceChargeRatePercent}%)`,
    },
    {
      part: "state_levy",
      amount: taxes.stateLevyAmount,
      description: `State / local levy on extra night, ${night} (${taxes.stateLevyRatePercent}%)`,
    },
    { part: "vat", amount: taxes.vatAmount, description: `VAT on extra night, ${night} (${taxes.vatRatePercent}%)` },
  ];

  return parts
    .filter((p) => p.part === "room" || p.amount > 0)
    .map((p, i) => ({
      // A millisecond apart so the folio lists the room line first, then its taxes.
      created_at: new Date(Date.now() + i).toISOString(),
      tenant_id: params.tenantId,
      reservation_id: params.reservationId,
      kind: "charge",
      amount: p.amount,
      method: "system",
      status: "posted",
      description: p.description,
      department: "rooms",
      posted_by: params.postedBy,
      reference: `${EXTRA_NIGHT_REF_PREFIX}${date}:${p.part}`,
      split_leg: "guest",
      currency_code: params.currency,
      metadata: {
        extraNight: date,
        part: p.part,
        auto: true,
        nightlyBar: price.nightlyBar,
        discountPercent: price.discountPercent,
      },
    }));
}

export type ExtraNightResult = {
  postedNights: string[];
  postedAmount: number;
  /** Nights owed but not charged until staff confirm the guest is still here. */
  waitingNights: string[];
};

/** Posts every extra night this stay owes and hasn't been charged for yet. Safe to call often. */
export async function postExtraNightCharges(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    reservation: ExtraNightReservation;
    pricing: HotelPricingSetup;
    postedBy: string | null;
    now?: Date;
  },
): Promise<ExtraNightResult> {
  const result: ExtraNightResult = { postedNights: [], postedAmount: 0, waitingNights: [] };
  const { reservation, pricing } = params;
  if (reservation.status !== "checked_in") return result;

  const owedAll = overdueNightDates(reservation.departure_at, pricing.checkOutTime, params.now ?? new Date());
  if (owedAll.length === 0) return result;
  const { allowed: owed, waiting } = splitOwedNights(owedAll, reservation.extra_nights_confirmed_on);
  result.waitingNights = waiting;

  const { data: existing, error: existingError } = await supabase
    .schema("hotel")
    .from("folio_transactions")
    .select("reference")
    .eq("tenant_id", params.tenantId)
    .eq("reservation_id", reservation.id)
    .like("reference", `${EXTRA_NIGHT_REF_PREFIX}%`);
  if (existingError) {
    console.error("[extra-nights] read", existingError);
    return result;
  }
  const done = new Set((existing ?? []).map((r) => extraNightDateOf(r.reference as string | null)));
  // A night already on the bill (say, charged before a limit change) isn't waiting any more.
  result.waitingNights = waiting.filter((d) => !done.has(d));

  const price = extraNightPricing(reservation, pricing);
  if (price.nightlyRate <= 0) return result;

  for (const date of owed) {
    if (done.has(date)) continue;
    const rows = rowsForNight({
      tenantId: params.tenantId,
      reservationId: reservation.id,
      date,
      price,
      currency: pricing.currency,
      postedBy: params.postedBy,
    });
    // One insert per night, so a night is posted whole or not at all.
    const { error } = await supabase.schema("hotel").from("folio_transactions").insert(rows);
    if (error) {
      if (error.code === "23505") continue; // another request posted this night first
      console.error("[extra-nights] insert", error);
      break;
    }
    result.postedNights.push(date);
    result.postedAmount = roundMoney(result.postedAmount + rows.reduce((s, r) => s + r.amount, 0));
  }
  return result;
}

/** Catches up every overdue in-house stay of one hotel. */
export async function postExtraNightsForTenant(
  supabase: SupabaseClient,
  params: { tenantId: string; pricingSetup: unknown; postedBy: string | null; now?: Date },
) {
  const now = params.now ?? new Date();
  const pricing = normalizePricingSetup(params.pricingSetup);
  const { data } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(EXTRA_NIGHT_RESERVATION_COLUMNS)
    .eq("tenant_id", params.tenantId)
    .eq("status", "checked_in")
    .lte("departure_at", now.toISOString())
    .limit(500);

  let nights = 0;
  const waitingByReservation = new Map<string, number>();
  for (const reservation of (data ?? []) as ExtraNightReservation[]) {
    const r = await postExtraNightCharges(supabase, {
      tenantId: params.tenantId,
      reservation,
      pricing,
      postedBy: params.postedBy,
      now,
    });
    nights += r.postedNights.length;
    if (r.waitingNights.length > 0) waitingByReservation.set(reservation.id, r.waitingNights.length);
  }
  return { stays: (data ?? []).length, nights, waitingByReservation };
}

/**
 * Staff have checked the guest is still in the room: charge the nights that were waiting, and
 * let the next {@link AUTO_EXTRA_NIGHTS} nights charge on their own again.
 */
export async function confirmGuestStillHere(
  supabase: SupabaseClient,
  params: { tenantId: string; reservation: ExtraNightReservation; pricing: HotelPricingSetup; postedBy: string; now?: Date },
): Promise<{ ok: true; result: ExtraNightResult } | { ok: false; error: string }> {
  const now = params.now ?? new Date();
  if (params.reservation.status !== "checked_in") return { ok: false, error: "This guest isn't staying now." };
  const confirmedOn = now.toISOString().slice(0, 10);

  const { error } = await supabase
    .schema("hotel")
    .from("reservations")
    .update({ extra_nights_confirmed_on: confirmedOn })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservation.id);
  if (error) return { ok: false, error: error.message };

  const result = await postExtraNightCharges(supabase, {
    tenantId: params.tenantId,
    reservation: { ...params.reservation, extra_nights_confirmed_on: confirmedOn },
    pricing: params.pricing,
    postedBy: params.postedBy,
    now,
  });
  return { ok: true, result };
}

/** Summary of the extra nights already on a folio, for the checkout screen and checkout. */
export function summariseExtraNights(lines: FolioLineRow[]) {
  const active = lines.filter((l) => !l.voided_at && isExtraNightLine(l));
  const nights = new Set(
    active.filter((l) => l.reference?.endsWith(":room")).map((l) => extraNightDateOf(l.reference)),
  );
  return {
    nights: nights.size,
    roomTotal: roundMoney(active.filter((l) => l.reference?.endsWith(":room")).reduce((s, l) => s + l.amount, 0)),
    total: roundMoney(active.reduce((s, l) => s + l.amount, 0)),
  };
}
