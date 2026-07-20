import { describe, expect, it } from "vitest";
import {
  ANYTIME_CHECK_IN,
  DEFAULT_PRICING_SETUP,
  formatCurrencySymbol,
  formatPricingAmount,
  formatPricingTime,
  getRoomPricingSummary,
  isRoomPricingSetupComplete,
  normalizePricingSetup,
  normalizeRoomTypes,
  roomTypeGridAbbrev,
  type HotelRoomTypeSetup,
} from "./room-pricing";

function makeRoomType(overrides: Partial<HotelRoomTypeSetup> = {}): HotelRoomTypeSetup {
  return {
    id: "rt-1",
    name: "Standard Suite",
    rooms: 10,
    maxOccupancy: 2,
    baseRate: 25000,
    boardBasis: "Room only",
    ...overrides,
  };
}

describe("roomTypeGridAbbrev", () => {
  it("prefers a manually set shortLabel, truncated to 8 characters", () => {
    expect(roomTypeGridAbbrev({ name: "Standard Suite", shortLabel: "SuperLongLabel" })).toBe(
      "SuperLon",
    );
  });

  it("ignores a blank shortLabel and falls back to name-derived initials", () => {
    expect(roomTypeGridAbbrev({ name: "Standard Suite", shortLabel: "   " })).toBe("SS");
  });

  it("builds initials (up to 4 letters) from a multi-word name", () => {
    expect(roomTypeGridAbbrev({ name: "Deluxe Ocean View Suite" })).toBe("DOVS");
  });

  it("uses the first two letters, uppercased, for a single-word name", () => {
    expect(roomTypeGridAbbrev({ name: "penthouse" })).toBe("PE");
  });

  it("returns '?' when the name is empty", () => {
    expect(roomTypeGridAbbrev({ name: "   " })).toBe("?");
  });
});

describe("normalizeRoomTypes", () => {
  it("returns an empty array for non-array input", () => {
    expect(normalizeRoomTypes(null)).toEqual([]);
    expect(normalizeRoomTypes("not an array")).toEqual([]);
    expect(normalizeRoomTypes(undefined)).toEqual([]);
  });

  it("drops entries that are not objects or have no name", () => {
    const result = normalizeRoomTypes([null, "string", 42, {}, { name: "  " }]);
    expect(result).toEqual([]);
  });

  it("fills in defaults for missing fields and generates a fallback id", () => {
    const [roomType] = normalizeRoomTypes([{ name: "Standard" }]);
    expect(roomType).toEqual({
      id: "room-type-1",
      name: "Standard",
      rooms: 1,
      maxOccupancy: 2,
      baseRate: 0,
      boardBasis: "Room only",
    });
  });

  it("clamps rooms and maxOccupancy to a minimum of 1 and rounds baseRate to 2 decimals", () => {
    const [roomType] = normalizeRoomTypes([
      { name: "Suite", rooms: 0, maxOccupancy: -5, baseRate: 199.999 },
    ]);
    expect(roomType.rooms).toBe(1);
    expect(roomType.maxOccupancy).toBe(1);
    expect(roomType.baseRate).toBe(200);
  });

  it("only includes shortLabel on the result when a non-empty value is provided", () => {
    const [withLabel] = normalizeRoomTypes([{ name: "Suite", shortLabel: "SU" }]);
    const [withoutLabel] = normalizeRoomTypes([{ name: "Suite", shortLabel: "   " }]);
    expect(withLabel.shortLabel).toBe("SU");
    expect(withoutLabel.shortLabel).toBeUndefined();
  });
});

describe("normalizePricingSetup", () => {
  it("returns the default setup when given non-object input", () => {
    expect(normalizePricingSetup(null)).toEqual(DEFAULT_PRICING_SETUP);
    expect(normalizePricingSetup(undefined)).toEqual(DEFAULT_PRICING_SETUP);
  });

  it("uppercases and truncates the currency code to 8 characters", () => {
    const result = normalizePricingSetup({ currency: "  ngnextra  " });
    expect(result.currency).toBe("NGNEXTRA");
  });

  it("clamps taxRate and serviceChargeRate to a max of 100", () => {
    const result = normalizePricingSetup({ taxRate: 250, serviceChargeRate: -10 });
    expect(result.taxRate).toBe(100);
    expect(result.serviceChargeRate).toBe(0);
  });

  it("falls back to defaults for a non-time checkOutTime and normalizes checkInTime case", () => {
    const result = normalizePricingSetup({ checkInTime: "ANYTIME", checkOutTime: "not-a-time" });
    expect(result.checkInTime).toBe(ANYTIME_CHECK_IN);
    expect(result.checkOutTime).toBe(DEFAULT_PRICING_SETUP.checkOutTime);
  });

  it("accepts a valid HH:mm checkInTime", () => {
    const result = normalizePricingSetup({ checkInTime: "14:30" });
    expect(result.checkInTime).toBe("14:30");
  });
});

describe("isRoomPricingSetupComplete", () => {
  it("is false when there are no room types", () => {
    expect(isRoomPricingSetupComplete([])).toBe(false);
  });

  it("is false when any room type has zero rooms or zero base rate", () => {
    expect(
      isRoomPricingSetupComplete([makeRoomType({ rooms: 0 }), makeRoomType({ baseRate: 0 })]),
    ).toBe(false);
  });

  it("is true when configured rooms cover a positive signup count", () => {
    expect(isRoomPricingSetupComplete([makeRoomType({ rooms: 10 })], 5)).toBe(true);
  });

  it("is false when configured rooms fall short of the signup count", () => {
    expect(isRoomPricingSetupComplete([makeRoomType({ rooms: 3 })], 5)).toBe(false);
  });

  it("is true with any configured rooms when there is no signup count", () => {
    expect(isRoomPricingSetupComplete([makeRoomType({ rooms: 1 })])).toBe(true);
  });
});

describe("getRoomPricingSummary", () => {
  it("computes configured rooms, rate range, and remaining rooms against a fallback count", () => {
    const roomTypes = [
      makeRoomType({ rooms: 5, baseRate: 20000 }),
      makeRoomType({ id: "rt-2", rooms: 3, baseRate: 50000 }),
    ];
    const summary = getRoomPricingSummary(roomTypes, 10);
    expect(summary).toEqual({
      roomTypeCount: 2,
      configuredRooms: 8,
      totalRooms: 10,
      remainingRooms: 2,
      excessRooms: 0,
      lowestRate: 20000,
      highestRate: 50000,
    });
  });

  it("reports excessRooms when configured rooms exceed the fallback count", () => {
    const summary = getRoomPricingSummary([makeRoomType({ rooms: 12 })], 10);
    expect(summary.excessRooms).toBe(2);
    expect(summary.remainingRooms).toBe(0);
  });

  it("returns null rates when there are no room types with a positive rate", () => {
    const summary = getRoomPricingSummary([], 0);
    expect(summary.lowestRate).toBeNull();
    expect(summary.highestRate).toBeNull();
  });
});

describe("formatCurrencySymbol", () => {
  it("returns an empty string for an empty currency", () => {
    expect(formatCurrencySymbol("")).toBe("");
  });

  it("returns the hardcoded symbol for a known currency", () => {
    expect(formatCurrencySymbol("ngn")).toBe("₦");
    expect(formatCurrencySymbol("USD")).toBe("$");
  });

  it("falls back to the currency code itself for an invalid ISO code", () => {
    expect(formatCurrencySymbol("AB")).toBe("AB");
  });
});

describe("formatPricingAmount", () => {
  it("returns 'Not set' for null or non-finite amounts", () => {
    expect(formatPricingAmount(null, "NGN")).toBe("Not set");
    expect(formatPricingAmount(NaN, "NGN")).toBe("Not set");
  });

  it("formats a known currency using its hardcoded symbol with no spacer", () => {
    expect(formatPricingAmount(1000, "NGN")).toBe("₦1,000");
  });

  it("adds a spacer before the amount when the symbol is alphabetic", () => {
    expect(formatPricingAmount(1000, "ETB")).toBe("Br 1,000");
  });

  it("falls back to a manual currency-code prefix when Intl cannot format the currency", () => {
    expect(formatPricingAmount(500, "AB")).toBe("AB 500");
  });
});

describe("formatPricingTime", () => {
  it("returns 'Not set' for an empty value", () => {
    expect(formatPricingTime("")).toBe("Not set");
  });

  it("returns 'Anytime' for the anytime sentinel", () => {
    expect(formatPricingTime(ANYTIME_CHECK_IN)).toBe("Anytime");
  });

  it("returns the raw value unchanged when it isn't a valid HH:mm time", () => {
    expect(formatPricingTime("garbage")).toBe("garbage");
  });

  it("formats a valid 24h time string as a 12h clock time", () => {
    expect(formatPricingTime("14:30")).toBe("2:30 PM");
    expect(formatPricingTime("00:00")).toBe("12:00 AM");
  });
});
