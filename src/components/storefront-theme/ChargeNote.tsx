"use client";

import { CURRENCY_NAMES, type ShopCurrencyCode } from "@/lib/store/currencies";
import { useMoney, useT } from "./StorefrontProvider";

/** The currency's name in the shopper's language ("Nigerian naira"), or the shop's English name for it. */
const nameOf = (code: string | null, lang: string) => {
  if (!code) return "";
  if (lang !== "en") {
    try {
      const name = new Intl.DisplayNames([lang], { type: "currency" }).of(code);
      if (name) return name;
    } catch {
      // No name for it in this language: the English one below.
    }
  }
  return CURRENCY_NAMES[code as ShopCurrencyCode] || code;
};

/**
 * Shown under basket and checkout totals when the shopper is viewing another
 * currency: they're charged in the shop's own currency, so say how much.
 */
export default function ChargeNote({ homeAmount }: { homeAmount: number }) {
  const money = useMoney();
  const t = useT();
  if (money.isHome) return null;
  return (
    <p className="hint charge-note">
      {t("checkout.chargeNote", { code: money.code ?? "", amount: money.formatHome(homeAmount), currency: nameOf(money.homeCurrency, t.lang) })}
    </p>
  );
}

/** The short version, under a product's price, so shoppers know before they reach the basket. */
export function GuidePriceNote() {
  const money = useMoney();
  const t = useT();
  if (money.isHome) return null;
  return (
    <p className="hint charge-note">
      {t("checkout.guidePrice", { code: money.code ?? "", currency: nameOf(money.homeCurrency, t.lang) })}
    </p>
  );
}
