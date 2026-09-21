import { describe, expect, it } from "vitest";
import { fromSubunitAmount, mapOrderErrorMessage, resolveCartCurrency, toSubunitAmount } from "./checkout";

describe("toSubunitAmount / fromSubunitAmount", () => {
  it("converts main-unit amounts to Paystack's kobo-style subunit", () => {
    expect(toSubunitAmount(100)).toBe(10000);
    expect(toSubunitAmount(12000.5)).toBe(1200050);
  });

  it("rounds to the nearest whole subunit to avoid float dust", () => {
    // 19.999999999998 * 100 in raw floating point drifts just under 2000 --
    // this is exactly the kind of bug the shared helper exists to prevent.
    expect(toSubunitAmount(19.999999999998)).toBe(2000);
    expect(toSubunitAmount(0.1 + 0.2)).toBe(30);
  });

  it("round-trips back to the original main-unit amount", () => {
    expect(fromSubunitAmount(toSubunitAmount(12345.67))).toBeCloseTo(12345.67, 2);
    expect(fromSubunitAmount(150000)).toBe(1500);
  });
});

describe("resolveCartCurrency", () => {
  it("falls back to the platform default when every product's currency is unset", () => {
    expect(resolveCartCurrency([null, undefined, null])).toBe("NGN");
  });

  it("uses the one explicit currency when all products agree", () => {
    expect(resolveCartCurrency(["USD", "USD", null])).toBe("USD");
  });

  it("throws when products in the same cart disagree on currency", () => {
    expect(() => resolveCartCurrency(["USD", "GHS"])).toThrow(/different currencies/i);
  });
});

describe("mapOrderErrorMessage", () => {
  it("maps a known error code with a product-name detail into a full sentence", () => {
    expect(mapOrderErrorMessage("INSUFFICIENT_STOCK: Wireless Headphones")).toBe(
      "Wireless Headphones doesn't have enough stock for the quantity you requested.",
    );
  });

  it("maps a known error code with no detail, capitalizing the first letter", () => {
    expect(mapOrderErrorMessage("ORDER_EMPTY")).toBe("Your cart is empty.");
  });

  it("falls back to a generic message for an unrecognized code", () => {
    expect(mapOrderErrorMessage("something_unexpected")).toMatch(/couldn't process your order/i);
  });

  it("falls back to a generic message for an empty string", () => {
    expect(mapOrderErrorMessage("")).toMatch(/couldn't process your order/i);
  });
});
