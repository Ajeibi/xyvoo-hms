import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { loadRateBook } from "@/lib/hms/rates/book";
import { priceStay, quoteAllPlans, stayTotals, type PriceStayInput } from "@/lib/hms/rates/pricing";
import type { NightPrice, RateIssue } from "@/lib/hms/rates/types";
import { availabilityByType } from "@/lib/hms/reservation-availability";

/*
 * Quotes for the booking screens, the website engine and booking sites: every plan a room type can
 * be sold on for a stay, each with its nightly prices, taxes, conditions and anything that stops
 * it being booked. The prices come from priceStay; nothing is worked out here.
 */

export type PlanQuote = {
  planId: string;
  planCode: string;
  planName: string;
  boardBasis: string;
  refundable: boolean;
  prepayRequired: boolean;
  nights: NightPrice[];
  nightlyAmounts: number[];
  averageRate: number;
  roomTotal: number;
  taxTotal: number;
  grandTotal: number;
  bookable: boolean;
  issues: RateIssue[];
};

export type RoomTypeQuote = {
  roomTypeCode: string;
  roomTypeName: string;
  /** Rooms left for the whole stay (the lowest night). */
  available: number;
  plans: PlanQuote[];
};

export type QuoteParams = Omit<PriceStayInput, "plan" | "roomTypeCode"> & { roomTypeCode?: string | null; plan?: string | null; onlyBookable?: boolean };

export async function quoteStayAllPlans(
  db: SupabaseClient,
  tenant: { id: string; room_types: unknown; pricing_setup: unknown },
  params: QuoteParams,
): Promise<{ ok: true; currency: string; nights: number; roomTypes: RoomTypeQuote[] } | { ok: false; error: string }> {
  const book = await loadRateBook(db, tenant, { since: params.arrivalDay });
  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const types = book.roomTypes.filter((t) => !params.roomTypeCode || t.id === params.roomTypeCode);
  if (types.length === 0) return { ok: false, error: "That room type isn't set up in your hotel settings." };

  const avail = await availabilityByType(db, {
    tenantId: tenant.id,
    roomTypes: normalizeRoomTypes(tenant.room_types).filter((t) => types.some((x) => x.id === t.id)),
    fromDay: params.arrivalDay,
    toDay: params.departureDay,
  });

  let nightsCount = 0;
  const roomTypes: RoomTypeQuote[] = [];
  for (const t of types) {
    const base: Omit<PriceStayInput, "plan"> = { ...params, roomTypeCode: t.id };
    const results = params.plan
      ? [priceStay(book, { ...base, plan: params.plan })].flatMap((r) => (r.ok ? [r] : []))
      : quoteAllPlans(book, base, { onlyBookable: params.onlyBookable });
    if (params.plan && results.length === 0) {
      const r = priceStay(book, { ...base, plan: params.plan });
      if (!r.ok) return { ok: false, error: r.error };
    }
    const plans: PlanQuote[] = results.map((r) => {
      nightsCount = r.nights.length;
      const totals = stayTotals({ nightly: r.nightlyAmounts, serviceChargeRate: pricing.serviceChargeRate, taxRate: pricing.taxRate });
      return {
        planId: r.plan.id,
        planCode: r.plan.code,
        planName: r.plan.name,
        boardBasis: r.plan.boardBasis,
        refundable: r.plan.refundable,
        prepayRequired: r.plan.prepayRequired,
        nights: r.nights,
        nightlyAmounts: r.nightlyAmounts,
        averageRate: r.averageRate,
        roomTotal: r.roomTotal,
        taxTotal: Math.round((totals.taxes.grandTotal - totals.roomSubtotalAfterDiscount) * 100) / 100,
        grandTotal: totals.taxes.grandTotal,
        bookable: r.bookable,
        issues: r.issues,
      };
    });
    const a = avail.find((x) => x.roomTypeCode === t.id);
    roomTypes.push({ roomTypeCode: t.id, roomTypeName: t.name, available: a ? Math.max(0, a.minFree) : 0, plans });
  }
  return { ok: true, currency: book.currency, nights: nightsCount, roomTypes };
}
