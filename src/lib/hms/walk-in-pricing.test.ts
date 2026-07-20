import { describe, expect, it } from "vitest";
import type { HotelPricingSetup, HotelRoomTypeSetup } from "./room-pricing";
import type { NigeriaTaxExemptions } from "./nigeria-hospitality-taxes";
import {
  assertWithinRoomTypeOccupancy,
  calendarNightsBetween,
  computeWalkInRoomPricing,
  nightlyBarBeforeDiscount,
  totalHeadcount,
  type DiscountScope,
} from "./walk-in-pricing";

const roomType: HotelRoomTypeSetup = {
  id: "rt-1",
  name: "Standard Suite",
  rooms: 10,
  maxOccupancy: 3,
  baseRate: 20000,
  boardBasis: "Room only",
};

const singleOccupancyRoomType: HotelRoomTypeSetup = {
  ...roomType,
  id: "rt-single",
  maxOccupancy: 1,
};

const pricing: HotelPricingSetup = {
  currency: "NGN",
  taxRate: 5,
  serviceChargeRate: 10,
  extraAdultRate: 5000,
  extraChildRate: 2000,
  checkInTime: "anytime",
  checkOutTime: "12:00",
};

const noExemptions: NigeriaTaxExemptions = {
  exemptVat: false,
  exemptServiceCharge: false,
  exemptStateLevy: false,
  exemptStampLevy: false,
};

describe("calendarNightsBetween", () => {
  it("counts the calendar nights between an arrival and departure date", () => {
    expect(calendarNightsBetween("2024-01-01", "2024-01-04")).toBe(3);
  });

  it("clamps to a minimum of 1 night for a same-day or reversed range", () => {
    expect(calendarNightsBetween("2024-01-01", "2024-01-01")).toBe(1);
    expect(calendarNightsBetween("2024-01-04", "2024-01-01")).toBe(1);
  });
});

describe("nightlyBarBeforeDiscount", () => {
  it("charges no extras for double occupancy within a room that allows 2+ guests", () => {
    const bar = nightlyBarBeforeDiscount(roomType, pricing, 2, 0, 0);
    expect(bar).toBe(20000);
  });

  it("charges the extra-adult rate for adults beyond the included two", () => {
    const bar = nightlyBarBeforeDiscount(roomType, pricing, 3, 0, 0);
    expect(bar).toBe(20000 + 5000);
  });

  it("charges the extra-child rate per child regardless of occupancy", () => {
    const bar = nightlyBarBeforeDiscount(roomType, pricing, 2, 2, 0);
    expect(bar).toBe(20000 + 2 * 2000);
  });

  it("only includes 1 adult for a room type with maxOccupancy of 1", () => {
    const bar = nightlyBarBeforeDiscount(singleOccupancyRoomType, pricing, 2, 0, 0);
    expect(bar).toBe(20000 + 5000);
  });

  it("ignores infants entirely", () => {
    const bar = nightlyBarBeforeDiscount(roomType, pricing, 2, 0, 4);
    expect(bar).toBe(20000);
  });
});

describe("computeWalkInRoomPricing", () => {
  function price(discountScope: DiscountScope, discountPercent: number, nights = 3) {
    return computeWalkInRoomPricing({
      roomType,
      pricing,
      adults: 2,
      children: 0,
      infants: 0,
      nights,
      discountPercent,
      discountScope,
      taxExemptions: noExemptions,
    });
  }

  it("applies no discount and stacks taxes on top of the full subtotal when scope is 'none'", () => {
    const result = price("none", 20, 3);
    expect(result.nightlyAmounts).toEqual([20000, 20000, 20000]);
    expect(result.roomSubtotalBeforeDiscount).toBe(60000);
    expect(result.roomDiscountAmount).toBe(0);
    expect(result.roomSubtotalAfterDiscount).toBe(60000);
    // taxes are computed from the discounted subtotal
    expect(result.taxes.roomTaxableBase).toBe(60000);
  });

  it("discounts every night when scope is 'all_nights'", () => {
    const result = price("all_nights", 10, 3);
    expect(result.nightlyAmounts).toEqual([18000, 18000, 18000]);
    expect(result.roomDiscountAmount).toBe(6000);
    expect(result.roomSubtotalAfterDiscount).toBe(54000);
  });

  it("only discounts the first night when scope is 'first_night'", () => {
    const result = price("first_night", 10, 3);
    expect(result.nightlyAmounts).toEqual([18000, 20000, 20000]);
    expect(result.roomDiscountAmount).toBe(2000);
  });

  it("only discounts the last night when scope is 'last_night'", () => {
    const result = price("last_night", 10, 3);
    expect(result.nightlyAmounts).toEqual([20000, 20000, 18000]);
    expect(result.roomDiscountAmount).toBe(2000);
  });

  it("discounts both the first and last night when scope is 'first_and_last'", () => {
    const result = price("first_and_last", 10, 3);
    expect(result.nightlyAmounts).toEqual([18000, 20000, 18000]);
    expect(result.roomDiscountAmount).toBe(4000);
  });

  it("clamps a discount percent above 100 down to 100", () => {
    const result = price("all_nights", 250, 1);
    expect(result.nightlyAmounts).toEqual([0]);
    expect(result.roomDiscountAmount).toBe(20000);
  });

  it("clamps a negative discount percent to 0", () => {
    const result = price("all_nights", -10, 1);
    expect(result.nightlyAmounts).toEqual([20000]);
    expect(result.roomDiscountAmount).toBe(0);
  });

  it("feeds the post-discount subtotal into the Nigeria tax calculation", () => {
    const result = price("all_nights", 10, 1);
    expect(result.roomSubtotalAfterDiscount).toBe(18000);
    expect(result.taxes.roomTaxableBase).toBe(18000);
    expect(result.taxes.serviceChargeAmount).toBe(1800);
    expect(result.taxes.stateLevyAmount).toBe(900);
  });
});

describe("totalHeadcount", () => {
  it("sums adults, children, and infants", () => {
    expect(totalHeadcount(2, 1, 1)).toBe(4);
  });

  it("treats negative counts as zero instead of subtracting", () => {
    expect(totalHeadcount(-2, 3, 0)).toBe(3);
  });
});

describe("assertWithinRoomTypeOccupancy", () => {
  it("is ok when headcount is within maxOccupancy and there is at least one adult", () => {
    expect(assertWithinRoomTypeOccupancy(roomType, 2, 1, 0)).toEqual({ ok: true });
  });

  it("rejects when total headcount exceeds maxOccupancy", () => {
    const result = assertWithinRoomTypeOccupancy(roomType, 2, 2, 0);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      message: expect.stringContaining("allows at most 3 guest(s)"),
    });
  });

  it("rejects when there are zero adults, even within occupancy limits", () => {
    const result = assertWithinRoomTypeOccupancy(roomType, 0, 1, 0);
    expect(result).toEqual({ ok: false, message: "At least one adult is required." });
  });
});
