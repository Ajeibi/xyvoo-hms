/** Each currency in the way its own customers write it: ₦12,000, GH₵120, Ksh 1,200, R 250, US$12.99, £12. */
const CURRENCY_FORMAT: Record<string, { locale: string; display: "symbol" | "narrowSymbol" }> = {
  NGN: { locale: "en-NG", display: "symbol" },
  GHS: { locale: "en-GH", display: "symbol" },
  KES: { locale: "en-KE", display: "symbol" },
  ZAR: { locale: "en-GB", display: "narrowSymbol" },
};

/** The symbol customers of this currency know, e.g. "₦", "GH₵", "Ksh". */
export function currencySymbol(currency: string | null) {
  const code = (currency || "NGN").toUpperCase();
  const { locale, display } = CURRENCY_FORMAT[code] ?? { locale: "en-GB", display: "symbol" as const };
  return new Intl.NumberFormat(locale, { style: "currency", currency: code, currencyDisplay: display }).formatToParts(0).find((p) => p.type === "currency")?.value ?? code;
}

/**
 * Whole amounts show without decimals (₦12,000); others to two places
 * (US$12.99). Receipts pass fractionDigits: 2 to always show pence and kobo.
 */
export function formatShopCurrency(value: number, currency: string | null, options: { fractionDigits?: number } = {}) {
  const code = (currency || "NGN").toUpperCase();
  const { locale, display } = CURRENCY_FORMAT[code] ?? { locale: "en-GB", display: "symbol" as const };
  const digits = options.fractionDigits ?? (Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    currencyDisplay: display,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}
