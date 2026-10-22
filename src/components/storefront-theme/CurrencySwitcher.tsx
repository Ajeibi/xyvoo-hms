"use client";

import { CURRENCY_NAMES, type ShopCurrencyCode } from "@/lib/store/currencies";
import type { Translator } from "@/lib/store/i18n/translate";
import { announce, useMoney, useT } from "./StorefrontProvider";

/** The currency's name in the shopper's language (our own English names in English). */
function currencyName(code: string, t: Translator) {
  const english = CURRENCY_NAMES[code as ShopCurrencyCode];
  if (t.lang === "en" && english) return english;
  try {
    return new Intl.DisplayNames([t.lang], { type: "currency" }).of(code) ?? english ?? code;
  } catch {
    return english ?? code;
  }
}

/** Lets shoppers see prices in another currency the shop offers. Hidden when there's only one. */
export default function CurrencySwitcher() {
  const money = useMoney();
  const t = useT();
  if (money.currencies.length < 2) return null;

  return (
    <div className="currency-switch">
      <label className="visually-hidden" htmlFor="currency-switch">
        {t("chrome.showPricesIn")}
      </label>
      <select
        id="currency-switch"
        value={money.code ?? ""}
        onChange={(e) => {
          money.setCurrency(e.target.value);
          announce(t("chrome.pricesNowIn", { currency: currencyName(e.target.value, t) }));
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
