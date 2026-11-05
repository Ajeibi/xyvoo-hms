import type { SupabaseClient } from "@supabase/supabase-js";
import { depositFor, policyFor } from "@/lib/hms/folio-deposits-shared";
import { listDepositPolicies } from "@/lib/hms/folio-deposits";
import { cancellationPolicyFor, describePolicy } from "@/lib/hms/reservation-cancellation-shared";
import { listCancellationPolicies } from "@/lib/hms/reservation-cancellation";
import { addDays, nightCountsForType, freeOnNight } from "@/lib/hms/reservation-availability";
import { quoteStayAllPlans } from "@/lib/hms/rates/quote";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { loadOffers, upsellAmount, type UpsellKind, type UpsellUnit } from "@/lib/hms/upsells";
import { assertWithinRoomTypeOccupancy } from "@/lib/hms/walk-in-pricing";
import { NOT_OFFERED, money2, nightsBetween, splitGuests } from "./web-shared";

/*
 * What the website offers for a stay: every room type with how many are left, each rate plan priced
 * by the rate book's own function (night by night, with taxes and service charge), the deposit the
 * hotel asks for, the cancellation terms, the add-ons it sells, and, for a sold-out room type, the
 * nearest dates that are free. The booking route asks this same function again before it books, so
 * the price a guest sees and the price they are charged cannot come apart.
 */

export type WebTenant = { id: string; room_types: unknown; pricing_setup: unknown };

export type WebStayQuery = { checkIn: string; checkOut: string; adults: number; children: number; rooms: number };

export type WebPlanOffer = {
  code: string;
  name: string;
  boardBasis: string;
  refundable: boolean;
  prepayRequired: boolean;
  /** Per room. */
  averageRate: number;
  roomTotal: number;
  taxTotal: number;
  grandTotal: number;
  /** For all the rooms asked for. */
  totalAllRooms: number;
  deposit: { required: number; dueDate: string | null };
  bookable: boolean;
  reasons: string[];
};

export type WebAlternative = { checkIn: string; checkOut: string };

export type WebRoomOffer = {
  id: string;
  name: string;
  /** Rooms left for the whole stay. */
  left: number;
  /** Enough rooms for the number asked for. */
  open: boolean;
  /** Why the party doesn't fit, when it doesn't. */
  fitsProblem: string | null;
  cancellation: string[];
  plans: WebPlanOffer[];
  /** Nearby dates with enough rooms, for a room type that is sold out. */
  alternatives: WebAlternative[];
};

export type WebAddonOffer = { id: string; name: string; description: string | null; kind: UpsellKind; unit: UpsellUnit; price: number; amount: number };

export type WebOffer = {
  currency: string;
  nights: number;
  rooms: number;
  perRoom: { adults: number; children: number };
  roomTypes: WebRoomOffer[];
  addons: WebAddonOffer[];
};

/** Add-ons staff must arrange in person; the website never sells them. */
const NOT_ONLINE: UpsellKind[] = ["room_upgrade"];

async function alternativesFor(db: SupabaseClient, tenantId: string, code: string, q: WebStayQuery, today: string): Promise<WebAlternative[]> {
  const nights = nightsBetween(q.checkIn, q.checkOut);
  const from = addDays(q.checkIn, -7);
  const to = addDays(q.checkIn, 21 + nights);
  const counts = await nightCountsForType(db, { tenantId, roomTypeCode: code, fromDay: from, toDay: to });
  if (counts.length === 0) return [];
  const freeByNight = new Map(counts.map((c) => [c.night, freeOnNight(c).free]));
  const found: { shift: number; checkIn: string }[] = [];
  for (let shift = -7; shift <= 21; shift++) {
    if (shift === 0) continue;
    const start = addDays(q.checkIn, shift);
    if (start < today) continue;
    let ok = true;
    for (let i = 0; i < nights; i++) {
      const free = freeByNight.get(addDays(start, i));
      if (free === undefined || free < q.rooms) {
        ok = false;
        break;
      }
    }
    if (ok) found.push({ shift, checkIn: start });
  }
  return found
    .sort((a, b) => Math.abs(a.shift) - Math.abs(b.shift) || a.shift - b.shift)
    .slice(0, 3)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .map((f) => ({ checkIn: f.checkIn, checkOut: addDays(f.checkIn, nights) }));
}

export async function webOffer(
  db: SupabaseClient,
  tenant: WebTenant,
  q: WebStayQuery,
  today: string,
  opts: { withAlternatives?: boolean } = {},
): Promise<{ ok: true; offer: WebOffer } | { ok: false; error: string }> {
  const party = splitGuests(q.adults, q.children, q.rooms);
  const first = party[0];
  const quote = await quoteStayAllPlans(db, tenant, {
    arrivalDay: q.checkIn,
    departureDay: q.checkOut,
    adults: first.adults,
    children: first.children,
    channel: "website",
    bookedOn: today,
  });
  if (!quote.ok) return { ok: false, error: quote.error };

  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const types = normalizeRoomTypes(tenant.room_types);
  const [depositPolicies, cancelPolicies, offers] = await Promise.all([
    listDepositPolicies(db, tenant.id),
    listCancellationPolicies(db, tenant.id),
    loadOffers(db, tenant.id, { activeOnly: true }),
  ]);
  const nights = quote.nights;

  const roomTypes: WebRoomOffer[] = [];
  for (const t of quote.roomTypes) {
    const setup = types.find((x) => x.id === t.roomTypeCode);
    // Every room is for its own party; the largest party is the one that has to fit.
    let fitsProblem: string | null = null;
    if (setup) {
      for (const p of party) {
        const fit = assertWithinRoomTypeOccupancy(setup, p.adults, p.children, 0);
        if (!fit.ok) {
          fitsProblem = fit.message;
          break;
        }
      }
    }
    const open = t.available >= q.rooms;
    const plans: WebPlanOffer[] = t.plans
      .filter((p) => !p.issues.some((i) => NOT_OFFERED.has(i.kind)))
      .map((p) => {
        const dep = depositFor(policyFor(depositPolicies, t.roomTypeCode), { stayTotal: p.grandTotal, nights, arrivalDate: q.checkIn, bookedOn: today });
        return {
          code: p.planCode,
          name: p.planName,
          boardBasis: p.boardBasis,
          refundable: p.refundable,
          prepayRequired: p.prepayRequired,
          averageRate: p.averageRate,
          roomTotal: p.roomTotal,
          taxTotal: p.taxTotal,
          grandTotal: p.grandTotal,
          totalAllRooms: money2(p.grandTotal * q.rooms),
          deposit: { required: money2(dep.required * q.rooms), dueDate: dep.dueDate },
          bookable: p.bookable && open && !fitsProblem,
          // The rate book already says when the party is too big for the room; only add ours when it doesn't.
          reasons: p.issues.length > 0 ? p.issues.map((i) => i.message) : fitsProblem ? [fitsProblem] : [],
        };
      });
    roomTypes.push({
      id: t.roomTypeCode,
      name: t.roomTypeName,
      left: Math.max(0, t.available),
      open,
      fitsProblem,
      cancellation: describePolicy(cancellationPolicyFor(cancelPolicies, t.roomTypeCode), pricing.currency),
      plans,
      alternatives: [],
    });
  }

  if (opts.withAlternatives) {
    await Promise.all(
      roomTypes
        .filter((r) => !r.open)
        .map(async (r) => {
          r.alternatives = await alternativesFor(db, tenant.id, r.id, q, today).catch(() => []);
        }),
    );
  }

  const addons: WebAddonOffer[] = offers
    .filter((o) => !NOT_ONLINE.includes(o.kind))
    .map((o) => ({
      id: o.id,
      name: o.name,
      description: o.description,
      kind: o.kind,
      unit: o.unit,
      price: o.price,
      amount: money2(party.reduce((sum, p) => sum + upsellAmount(o, { nights, adults: p.adults }), 0)),
    }));

  return { ok: true, offer: { currency: pricing.currency, nights, rooms: q.rooms, perRoom: { adults: first.adults, children: first.children }, roomTypes, addons } };
}

/** The plan a guest chose in an offer: by code or name, or the first one that can be booked when none is named. */
export function pickPlan(room: WebRoomOffer, wanted: string | null | undefined): WebPlanOffer | null {
  const w = (wanted ?? "").trim().toLowerCase();
  if (w) return room.plans.find((p) => p.code.toLowerCase() === w || p.name.toLowerCase() === w) ?? null;
  return room.plans.find((p) => p.bookable) ?? room.plans[0] ?? null;
}
