import type { HotelPricingSetup, HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import {
  computeNigeriaHospitalityTaxes,
  type NigeriaHospitalityTaxBreakdown,
  type NigeriaTaxExemptions,
} from "@/lib/hms/nigeria-hospitality-taxes";

export type DiscountScope = "none" | "all_nights" | "first_night" | "last_night" | "first_and_last";

export function calendarNightsBetween(arrivalDate: string, departureDate: string): number {
  const a = new Date(`${arrivalDate}T12:00:00.000Z`).getTime();
  const d = new Date(`${departureDate}T12:00:00.000Z`).getTime();
  const n = Math.round((d - a) / 86400000);
  return Math.max(1, n);
}

function nightQualifiesForDiscount(scope: DiscountScope, nightIndex: number, nights: number): boolean {
  if (scope === "none" || nights <= 0) return false;
  if (scope === "all_nights") return true;
  if (scope === "first_night") return nightIndex === 0;
  if (scope === "last_night") return nightIndex === nights - 1;
  if (scope === "first_and_last") return nightIndex === 0 || nightIndex === nights - 1;
  return false;
}

/** Included “base rate” adults before extra-adult charges: double occupancy when room allows ≥2. */
function includedAdultsForBar(roomType: HotelRoomTypeSetup) {
  return roomType.maxOccupancy >= 2 ? 2 : 1;
}

/**
 * Nightly BAR before % discount: room type base + extra person charges from tenant setup.
 */
export function nightlyBarBeforeDiscount(
  roomType: HotelRoomTypeSetup,
  pricing: HotelPricingSetup,
  adults: number,
  children: number,
  _infants: number,
): number {
  const inc = includedAdultsForBar(roomType);
  const extraAdults = Math.max(0, adults - inc);
  const bar =
    roomType.baseRate + extraAdults * pricing.extraAdultRate + children * pricing.extraChildRate;
  return Math.max(0, Math.round(bar * 100) / 100);
}

export type WalkInRoomPricingParams = {
  roomType: HotelRoomTypeSetup;
  pricing: HotelPricingSetup;
  adults: number;
  children: number;
  infants: number;
  nights: number;
  discountPercent: number;
  discountScope: DiscountScope;
  taxExemptions: NigeriaTaxExemptions;
};

export type WalkInRoomPricingResult = {
  nights: number;
  nightlyBar: number;
  nightlyAmounts: number[];
  roomSubtotalBeforeDiscount: number;
  roomDiscountAmount: number;
  roomSubtotalAfterDiscount: number;
  taxes: NigeriaHospitalityTaxBreakdown;
};

export function computeWalkInRoomPricing(params: WalkInRoomPricingParams): WalkInRoomPricingResult {
  const nightlyBar = nightlyBarBeforeDiscount(
    params.roomType,
    params.pricing,
    params.adults,
    params.children,
    params.infants,
  );
  const pct = Math.min(100, Math.max(0, params.discountPercent));

  const nightlyAmounts: number[] = [];
  let roomSubtotalBeforeDiscount = 0;
  let roomDiscountAmount = 0;

  for (let i = 0; i < params.nights; i += 1) {
    const gross = nightlyBar;
    roomSubtotalBeforeDiscount += gross;
    const apply = nightQualifiesForDiscount(params.discountScope, i, params.nights) && pct > 0;
    const disc = apply ? Math.round(((gross * pct) / 100) * 100) / 100 : 0;
    roomDiscountAmount += disc;
    nightlyAmounts.push(Math.round((gross - disc) * 100) / 100);
  }

  roomSubtotalBeforeDiscount = Math.round(roomSubtotalBeforeDiscount * 100) / 100;
  roomDiscountAmount = Math.round(roomDiscountAmount * 100) / 100;
  const roomSubtotalAfterDiscount = Math.round((roomSubtotalBeforeDiscount - roomDiscountAmount) * 100) / 100;

  const taxes = computeNigeriaHospitalityTaxes({
    roomTaxableBase: roomSubtotalAfterDiscount,
    serviceChargeRatePercent: params.pricing.serviceChargeRate,
    stateLevyRatePercent: params.pricing.taxRate,
    stampLevyAmount: 0,
    exemptions: params.taxExemptions,
  });

  return {
    nights: params.nights,
    nightlyBar,
    nightlyAmounts,
    roomSubtotalBeforeDiscount,
    roomDiscountAmount,
    roomSubtotalAfterDiscount,
    taxes,
  };
}

export function totalHeadcount(adults: number, children: number, infants: number) {
  return Math.max(0, adults) + Math.max(0, children) + Math.max(0, infants);
}

export function assertWithinRoomTypeOccupancy(
  roomType: HotelRoomTypeSetup,
  adults: number,
  children: number,
  infants: number,
): { ok: true } | { ok: false; message: string } {
  const head = totalHeadcount(adults, children, infants);
  if (head > roomType.maxOccupancy) {
    return {
      ok: false,
      message: `This room type allows at most ${roomType.maxOccupancy} guest(s). You have ${head} (adults + children + infants).`,
    };
  }
  if (adults < 1) {
    return { ok: false, message: "At least one adult is required." };
  }
  return { ok: true };
}
