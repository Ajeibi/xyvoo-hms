"use client";

import { CURRENCY_NAMES, type ShopCurrencyCode } from "@/lib/store/currencies";
import { announce, useMoney } from "./StorefrontProvider";

/** Lets shoppers see prices in another currency the shop offers. Hidden when there's only one. */
export default function CurrencySwitcher() {
  const money = useMoney();
  if (money.currencies.length < 2) return null;

  return (
    <div className="currency-switch">
      <label className="visually-hidden" htmlFor="currency-switch">
        Show prices in
      </label>
      <select
        id="currency-switch"
        value={money.code ?? ""}
        onChange={(e) => {
          money.setCurrency(e.target.value);
          announce(`Prices now shown in ${CURRENCY_NAMES[e.target.value as ShopCurrencyCode] ?? e.target.value}.`);
        }}
      >
        {money.currencies.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code}
          </option>
        ))}
      </select>
    </div>
  );
}
