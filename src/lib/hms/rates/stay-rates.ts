import { priceStay } from "@/lib/hms/rates/pricing";
import type { RateBook } from "@/lib/hms/rates/types";

/*
 * What the front desk uses to price a stay at check-in. A guest who is already at the desk is not
 * turned away by a sales restriction (minimum stay, closed to arrival): those apply when a booking
 * is made. So this returns the price of each night and ignores the restriction issues.
 */

export type StayRates = {
  /** The price of each night before any discount, extra-person charges included. */
  bars: number[];
  planId: string | null;
  planCode: string | null;
  planName: string | null;
  /** What a night after the last booked night costs: the last booked night's price. */
  extraNightBar: number;
};

export function stayRates(
  book: RateBook,
  input: {
    roomTypeCode: string;
    arrivalDay: string;
    departureDay: string;
    adults: number;
    children: number;
    /** The plan the booking was made on. Without one, or if it no longer exists, the default plan is used. */
    planCode?: string | null;
    arCustomerId?: string | null;
  },
): StayRates | null {
  const base = {
    roomTypeCode: input.roomTypeCode,
    arrivalDay: input.arrivalDay,
    departureDay: input.departureDay,
    adults: input.adults,
    children: input.children,
    channel: "front_desk" as const,
    arCustomerId: input.arCustomerId ?? null,
  };
  let priced = input.planCode ? priceStay(book, { ...base, plan: input.planCode }) : null;
  if (!priced || !priced.ok) priced = priceStay(book, base);
  if (!priced.ok || priced.nights.length === 0) return null;

  const bars = priced.nights.map((n) => n.total);
  const real = book.plans.some((p) => p.id === priced.plan.id);
  return {
    bars,
    planId: real ? priced.plan.id : null,
    planCode: real ? priced.plan.code : null,
    planName: real ? priced.plan.name : null,
    extraNightBar: bars[bars.length - 1],
  };
}
