import type { SupabaseClient } from "@supabase/supabase-js";
import { computeNigeriaHospitalityTaxes } from "@/lib/hms/nigeria-hospitality-taxes";
import { extraNightPricing, type ExtraNightReservation } from "@/lib/hms/folio-extra-nights";
import { adjustFolioForEarlyCheckout, computeEarlyCheckoutCredit, fetchFolioLines, type FolioLineRow } from "@/lib/hms/folio";
import type { HotelPricingSetup } from "@/lib/hms/room-pricing";
import { calendarNightsBetween } from "@/lib/hms/walk-in-pricing";

/*
 * Changing a stay's departure date from the stay itself: a later date (extended stay) or an
 * earlier one (early departure). Extending checks the room is free, prices the extra nights at
 * the stay's own rate and taxes, and puts them on the bill as part of the booked stay. Shortening
 * credits the unused nights the same way an early check-out does, but now rather than at the desk.
 */

export const STAY_EXTENSION_REF_PREFIX = "stay_extension:";
const MAX_CHANGE_NIGHTS = 60;

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDay(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export type StayChangeInput = {
  status: string;
  arrivalAt: string;
  departureAt: string;
  checkedInAt: string | null;
  nights: number;
  newDepartureDate: string;
  /** Today's date, as the front desk reads it (wall-clock stored as UTC). */
  today: string;
};

export type StayChangePlan =
  | {
      ok: true;
      kind: "extend" | "shorten";
      /** Date the stay now ends. */
      newDepartureDate: string;
      newDepartureAt: string;
      /** Nights added or removed, always positive. */
      changeNights: number;
      /** The dates of the nights added (extend) or dropped (shorten). */
      changeDates: string[];
    }
  | { ok: false; error: string };

export function planStayChange(input: StayChangeInput): StayChangePlan {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.newDepartureDate)) return { ok: false, error: "Choose a departure date." };
  if (input.status !== "confirmed" && input.status !== "checked_in") {
    return { ok: false, error: "Only a booking that is coming or in the house can change its dates." };
  }
  const current = input.departureAt.slice(0, 10);
  const next = input.newDepartureDate;
  if (next === current) return { ok: false, error: "That is already the departure date." };

  const start = (input.status === "checked_in" ? (input.checkedInAt ?? input.arrivalAt) : input.arrivalAt).slice(0, 10);
  if (next <= start) return { ok: false, error: "The guest must stay at least one night." };
  if (input.status === "checked_in" && next < input.today) {
    return { ok: false, error: "A guest who is in the house cannot leave on a date that has passed." };
  }

  const extend = next > current;
  const from = extend ? current : next;
  const to = extend ? next : current;
  const changeNights = calendarNightsBetween(from, to);
  if (changeNights > MAX_CHANGE_NIGHTS) {
    return { ok: false, error: `Change the stay by at most ${MAX_CHANGE_NIGHTS} nights at a time.` };
  }
  const changeDates = Array.from({ length: changeNights }, (_, i) => addDays(from, i));
  return {
    ok: true,
    kind: extend ? "extend" : "shorten",
    newDepartureDate: next,
    newDepartureAt: `${next}T${input.departureAt.slice(11)}`,
    changeNights,
    changeDates,
  };
}

export type ExtensionPrice = {
  nightlyRate: number;
  room: number;
  serviceCharge: number;
  stateLevy: number;
  vat: number;
  total: number;
  lines: { part: "room" | "service_charge" | "state_levy" | "vat"; amount: number; description: string }[];
};

/** What extra nights cost: the stay's own nightly rate (after an all-nights discount), with its taxes. */
export function priceExtension(
  reservation: ExtraNightReservation,
  pricing: HotelPricingSetup,
  nights: number,
  newDepartureDate: string,
): ExtensionPrice {
  const price = extraNightPricing(reservation, pricing);
  const room = roundMoney(price.nightlyRate * nights);
  const taxes = computeNigeriaHospitalityTaxes({
    roomTaxableBase: room,
    serviceChargeRatePercent: price.serviceChargeRatePercent,
    stateLevyRatePercent: price.stateLevyRatePercent,
    exemptions: price.exemptions,
  });
  const plural = `${nights} night${nights === 1 ? "" : "s"}`;
  const until = formatDay(newDepartureDate);
  const lines: ExtensionPrice["lines"] = [
    { part: "room", amount: room, description: `Stay extended by ${plural}, to ${until}` },
    { part: "service_charge", amount: taxes.serviceChargeAmount, description: `Service charge on extended stay (${taxes.serviceChargeRatePercent}%)` },
    { part: "state_levy", amount: taxes.stateLevyAmount, description: `State / local levy on extended stay (${taxes.stateLevyRatePercent}%)` },
    { part: "vat", amount: taxes.vatAmount, description: `VAT on extended stay (${taxes.vatRatePercent}%)` },
  ];
  const kept = lines.filter((l) => l.part === "room" || l.amount > 0);
  return {
    nightlyRate: price.nightlyRate,
    room,
    serviceCharge: taxes.serviceChargeAmount,
    stateLevy: taxes.stateLevyAmount,
    vat: taxes.vatAmount,
    total: roundMoney(kept.reduce((s, l) => s + l.amount, 0)),
    lines: kept,
  };
}

export type RoomConflict = { kind: "booking" | "block"; label: string };

/** Anything that stops the room being kept for `[fromIso, toIso)`: another booking or an active block. */
export async function findRoomConflicts(
  db: SupabaseClient,
  params: { tenantId: string; roomUnitId: string; reservationId: string; fromIso: string; toIso: string },
): Promise<RoomConflict[]> {
  const conflicts: RoomConflict[] = [];

  const { data: others } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,confirmation_code,arrival_at,departure_at")
    .eq("tenant_id", params.tenantId)
    .eq("room_unit_id", params.roomUnitId)
    .in("status", ["confirmed", "checked_in"])
    .neq("id", params.reservationId)
    .lt("arrival_at", params.toIso)
    .gt("departure_at", params.fromIso);
  for (const o of others ?? []) {
    conflicts.push({
      kind: "booking",
      label: `${o.confirmation_code as string} arrives ${formatDay((o.arrival_at as string).slice(0, 10))}`,
    });
  }

  const { data: blocks } = await db
    .schema("hotel")
    .from("room_blocks")
    .select("block_type,reason,start_at,end_at")
    .eq("tenant_id", params.tenantId)
    .eq("room_unit_id", params.roomUnitId)
    .eq("active", true)
    .neq("block_type", "soft")
    .lt("start_at", params.toIso);
  for (const b of blocks ?? []) {
    if (b.end_at && (b.end_at as string) <= params.fromIso) continue;
    conflicts.push({ kind: "block", label: `Room blocked: ${(b.reason as string) || b.block_type}` });
  }
  return conflicts;
}

export type StayChangeReservation = ExtraNightReservation & {
  arrival_at: string;
  checked_in_at: string | null;
  room_unit_id: string | null;
  total_room_charges: number | string | null;
};

export const STAY_CHANGE_RESERVATION_COLUMNS =
  "id,status,arrival_at,departure_at,checked_in_at,nights,room_unit_id,rate_per_night,total_room_charges,vat_applicable,tax_exempt,pricing_snapshot,extra_nights_confirmed_on";

export type StayChangePreview = {
  kind: "extend" | "shorten";
  newDepartureDate: string;
  changeNights: number;
  newNights: number;
  /** Charge to add (extend) or credit to give back (shorten), taxes included. */
  amount: number;
  nightlyRate: number | null;
  conflicts: RoomConflict[];
  /** Why this can't go ahead, if anything. */
  blocker: string | null;
};

type BillLines = Pick<FolioLineRow, "reference" | "voided_at" | "kind" | "department" | "method" | "metadata" | "description" | "amount">[];

function hasOverdueNights(lines: BillLines) {
  return lines.some((l) => !l.voided_at && (l.reference ?? "").startsWith("extra_night:"));
}

/** Works out what a date change would do, without changing anything. */
export async function previewStayChange(
  db: SupabaseClient,
  params: {
    tenantId: string;
    reservation: StayChangeReservation;
    pricing: HotelPricingSetup;
    newDepartureDate: string;
    today: string;
  },
): Promise<{ ok: true; plan: Extract<StayChangePlan, { ok: true }>; preview: StayChangePreview } | { ok: false; error: string }> {
  const { reservation: r } = params;
  const plan = planStayChange({
    status: r.status,
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    checkedInAt: r.checked_in_at,
    nights: Number(r.nights) || 1,
    newDepartureDate: params.newDepartureDate,
    today: params.today,
  });
  if (!plan.ok) return plan;

  const bookedNights = Math.max(1, Number(r.nights) || 1);
  let blocker: string | null = null;
  let conflicts: RoomConflict[] = [];
  let amount = 0;
  let nightlyRate: number | null = null;
  let newNights = bookedNights;

  const lines = r.status === "checked_in" ? await fetchFolioLines(db, params.tenantId, r.id) : [];
  if (r.status === "checked_in" && hasOverdueNights(lines)) {
    blocker = "This guest is already past their departure and is being charged extra nights. Check them out, or confirm they are still here, instead.";
  }

  if (plan.kind === "extend") {
    newNights = bookedNights + plan.changeNights;
    const price = priceExtension(r, params.pricing, plan.changeNights, plan.newDepartureDate);
    amount = price.total;
    nightlyRate = price.nightlyRate;
    if (r.room_unit_id) {
      conflicts = await findRoomConflicts(db, {
        tenantId: params.tenantId,
        roomUnitId: r.room_unit_id,
        reservationId: r.id,
        fromIso: r.departure_at,
        toIso: plan.newDepartureAt,
      });
    }
  } else if (r.status === "checked_in") {
    const credit = computeEarlyCheckoutCredit(lines as FolioLineRow[], {
      bookedNights,
      checkedInAt: r.checked_in_at ?? r.arrival_at,
      checkoutAt: new Date(plan.newDepartureAt),
    });
    if (credit.alreadyCredited) blocker = "This stay has already been shortened. Check the guest out instead.";
    amount = credit.creditAmount;
    newNights = credit.actualNights;
  } else {
    newNights = Math.max(1, bookedNights - plan.changeNights);
    const perNight = (Number(r.total_room_charges) || 0) / bookedNights;
    amount = roundMoney(perNight * (bookedNights - newNights));
  }

  return {
    ok: true,
    plan,
    preview: {
      kind: plan.kind,
      newDepartureDate: plan.newDepartureDate,
      changeNights: plan.changeNights,
      newNights,
      amount,
      nightlyRate,
      conflicts,
      blocker,
    },
  };
}

/** Makes the change: bill, booking dates and nights. Call only after {@link previewStayChange} said it can go ahead. */
export async function applyStayChange(
  db: SupabaseClient,
  params: {
    tenantId: string;
    reservation: StayChangeReservation;
    pricing: HotelPricingSetup;
    plan: Extract<StayChangePlan, { ok: true }>;
    userId: string;
  },
): Promise<{ ok: true; newNights: number; newTotalRoomCharges: number; billAmount: number } | { ok: false; error: string }> {
  const { reservation: r, plan } = params;
  const bookedNights = Math.max(1, Number(r.nights) || 1);
  const bookedTotal = Number(r.total_room_charges) || 0;
  let newNights = bookedNights;
  let newTotal = bookedTotal;
  let billAmount = 0;

  if (plan.kind === "extend") {
    const price = priceExtension(r, params.pricing, plan.changeNights, plan.newDepartureDate);
    newNights = bookedNights + plan.changeNights;
    newTotal = roundMoney(bookedTotal + price.room);
    billAmount = price.total;
    if (r.status === "checked_in" && price.total > 0) {
      const now = Date.now();
      const { error } = await db
        .schema("hotel")
        .from("folio_transactions")
        .insert(
          price.lines.map((l, i) => ({
            created_at: new Date(now + i).toISOString(),
            tenant_id: params.tenantId,
            reservation_id: r.id,
            kind: "charge",
            amount: l.amount,
            method: "system",
            status: "posted",
            description: l.description,
            department: "rooms",
            posted_by: params.userId,
            reference: `${STAY_EXTENSION_REF_PREFIX}${plan.newDepartureDate}:${l.part}`,
            split_leg: "guest",
            currency_code: params.pricing.currency,
            metadata: { stayCharge: true, part: l.part, extension: true, nights: plan.changeNights },
          })),
        );
      if (error) return { ok: false, error: "Could not put the extra nights on the bill." };
    }
  } else if (r.status === "checked_in") {
    const credit = await adjustFolioForEarlyCheckout(db, {
      tenantId: params.tenantId,
      reservationId: r.id,
      bookedNights,
      checkedInAt: r.checked_in_at ?? r.arrival_at,
      checkoutAt: new Date(plan.newDepartureAt),
      postedBy: params.userId,
      currencyCode: params.pricing.currency,
    });
    newNights = credit.actualNights;
    newTotal = roundMoney(bookedTotal * (newNights / bookedNights));
    billAmount = -credit.creditAmount;
  } else {
    newNights = Math.max(1, bookedNights - plan.changeNights);
    newTotal = roundMoney(bookedTotal * (newNights / bookedNights));
    billAmount = -roundMoney(bookedTotal - newTotal);
  }

  const { error } = await db
    .schema("hotel")
    .from("reservations")
    .update({ departure_at: plan.newDepartureAt, nights: newNights, total_room_charges: newTotal })
    .eq("tenant_id", params.tenantId)
    .eq("id", r.id);
  if (error) return { ok: false, error: "Could not update the booking." };
  return { ok: true, newNights, newTotalRoomCharges: newTotal, billAmount };
}
