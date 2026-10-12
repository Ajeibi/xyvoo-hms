"use client";

import type { FixedPrices } from "@/lib/store/currencies";
import { useMoney } from "./StorefrontProvider";

/**
 * A price in the shopper's chosen currency. `amount` and `compareAt` are in the
 * shop's home currency; `fixedPrices` are the merchant's own prices per
 * currency, used instead of conversion where set.
 */
export default function Price({ amount, compareAt, fixedPrices }: { amount: number; compareAt?: number | null; fixedPrices?: FixedPrices }) {
  const money = useMoney();
  const fixed = money.fixedFor(fixedPrices);
  const shown = money.convert(amount, fixed?.price);
  // With a fixed price, only the merchant's own "was" price is shown alongside it.
  const shownCompare = compareAt == null ? null : fixed ? fixed.compareAt : money.convert(compareAt);

  if (shownCompare != null && shownCompare > shown) {
    return (
      <>
        <span className="visually-hidden">Sale price </span>
        {money.format(shown)} <s><span className="visually-hidden">was </span>{money.format(shownCompare)}</s>
      </>
    );
  }
  return <>{money.format(shown)}</>;
}
