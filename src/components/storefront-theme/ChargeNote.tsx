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
      Prices in {nameOf(money.code)} are a guide. You&rsquo;ll pay {money.formatHome(homeAmount)} in {nameOf(money.homeCurrency)}, and your bank
      converts it, so the amount on your statement may be slightly different.
    </p>
  );
}
