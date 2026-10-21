"use client";

import { CURRENCY_NAMES, type ShopCurrencyCode } from "@/lib/store/currencies";
import { useMoney } from "./StorefrontProvider";

const nameOf = (code: string | null) => (code && CURRENCY_NAMES[code as ShopCurrencyCode]) || code || "";

/**
 * Shown under basket and checkout totals when the shopper is viewing another
 * currency: they're charged in the shop's own currency, so say how much.
 */
export default function ChargeNote({ homeAmount }: { homeAmount: number }) {
  const money = useMoney();
  if (money.isHome) return null;
  return (
    <p className="hint charge-note">
      Prices in {money.code} are a guide. You&rsquo;ll pay {money.formatHome(homeAmount)} in {nameOf(money.homeCurrency)}, and your bank
      converts it, so the amount on your statement may be slightly different.
    </p>
  );
}

/** The short version, under a product's price, so shoppers know before they reach the basket. */
export function GuidePriceNote() {
  const money = useMoney();
  if (money.isHome) return null;
  return (
    <p className="hint charge-note">
      Guide price in {money.code}. You&rsquo;ll pay in {nameOf(money.homeCurrency)}.
    </p>
  );
}
