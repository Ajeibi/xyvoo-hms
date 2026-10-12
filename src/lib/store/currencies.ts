import { z } from "zod";

/*
 * Extra currencies a shop shows prices in, alongside its home currency (set by
 * its country). Stored on store.business_profile.currencies. Each extra
 * currency is either converted automatically (a live or merchant-set rate, plus
 * an optional markup and rounding) or priced by hand per product in
 * store.product_prices, falling back to conversion for products without one.
 *
 * Shoppers are charged in the home currency for now (Paystack can't take GBP,
 * and USD needs the merchant's own dollar account), so extra currencies are
 * for display.
 */

export const SHOP_CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "USD", "GBP"] as const;
export type ShopCurrencyCode = (typeof SHOP_CURRENCIES)[number];

export const CURRENCY_NAMES: Record<ShopCurrencyCode, string> = {
  NGN: "Nigerian naira",
  GHS: "Ghanaian cedi",
  KES: "Kenyan shilling",
  ZAR: "South African rand",
  USD: "US dollar",
  GBP: "British pound",
};

/** The currency a shopper in each country most likely expects. */
const COUNTRY_CURRENCY: Record<string, ShopCurrencyCode> = {
  NG: "NGN",
  GH: "GHS",
  KE: "KES",
  ZA: "ZAR",
  US: "USD",
  GB: "GBP",
};

/** Remembers the currency a shopper picked in a shop. */
export function shopCurrencyCookie(slug: string) {
  return `sf_currency_${slug}`;
}

export function currencyForVisitorCountry(countryCode: string | null | undefined): ShopCurrencyCode | null {
  return countryCode ? COUNTRY_CURRENCY[countryCode.toUpperCase()] ?? null : null;
}

export const CURRENCY_ROUNDING = ["exact", "whole", "99"] as const;
export type CurrencyRounding = (typeof CURRENCY_ROUNDING)[number];

export const ROUNDING_LABELS: Record<CurrencyRounding, string> = {
  exact: "Exact (to the cent)",
  whole: "Round up to a whole number",
  "99": "End in .99",
};

const extraCurrencySchema = z.object({
  code: z.enum(SHOP_CURRENCIES),
  /** "auto" converts every price; "manual" means the merchant sets prices per product (conversion fills any gaps). */
  mode: z.enum(["auto", "manual"]).default("auto"),
  /** "live" uses the daily reference rate; "custom" uses the merchant's own. */
  rateSource: z.enum(["live", "custom"]).default("live"),
  /** Home-currency units to one unit of this currency, e.g. 1500 for "1 USD = ₦1,500". */
  customRate: z.number().positive().max(1_000_000).nullable().default(null),
  markupPercent: z.number().min(0).max(100).default(0),
  rounding: z.enum(CURRENCY_ROUNDING).default("whole"),
});
export type ExtraCurrency = z.infer<typeof extraCurrencySchema>;

export const currencySettingsSchema = z.object({
  extra: z
    .array(extraCurrencySchema)
    .max(SHOP_CURRENCIES.length)
    .default([])
    .refine((list) => list.every((c) => c.rateSource !== "custom" || c.customRate !== null), {
      message: "Enter your exchange rate for each currency that uses your own rate.",
    }),
});
export type CurrencySettings = z.infer<typeof currencySettingsSchema>;

/** Defaults for a currency the merchant has just added. */
export function newExtraCurrency(code: ShopCurrencyCode): ExtraCurrency {
  return extraCurrencySchema.parse({ code });
}

/** Reads the stored settings, dropping the home currency, duplicates and anything invalid. */
export function parseCurrencySettings(value: unknown, homeCurrency: string): CurrencySettings {
  const parsed = currencySettingsSchema.safeParse(value ?? {});
  if (!parsed.success) return { extra: [] };
  const seen = new Set<string>([homeCurrency]);
  return {
    extra: parsed.data.extra.filter((c) => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    }),
  };
}

/** A currency ready to convert into: everything the storefront needs, with the rate already resolved. */
export type DisplayCurrency = {
  code: string;
  /** Home-currency units to one unit of this currency. */
  rate: number;
  markupPercent: number;
  rounding: CurrencyRounding;
};

/** Units of each currency to one US dollar. */
export type FxRates = Record<string, number>;

/** Home-currency units to one unit of `code`, from the reference rates. Null if either rate is missing. */
export function liveRate(rates: FxRates, homeCurrency: string, code: string): number | null {
  const home = rates[homeCurrency];
  const other = rates[code];
  if (!home || !other) return null;
  return home / other;
}

/**
 * Turns the shop's settings into the currencies its shoppers can pick, home
 * currency first. A currency on the live rate is left out while no rate is
 * available, rather than showing a wrong price.
 */
export function resolveDisplayCurrencies(homeCurrency: string, settings: CurrencySettings, rates: FxRates): DisplayCurrency[] {
  const list: DisplayCurrency[] = [{ code: homeCurrency, rate: 1, markupPercent: 0, rounding: "exact" }];
  for (const c of settings.extra) {
    const rate = c.rateSource === "custom" ? c.customRate : liveRate(rates, homeCurrency, c.code);
    if (!rate) continue;
    list.push({ code: c.code, rate, markupPercent: c.markupPercent, rounding: c.rounding });
  }
  return list;
}

function applyRounding(value: number, rounding: CurrencyRounding) {
  if (value <= 0) return 0;
  // Tidy floating-point noise first, so 12.000000001 doesn't round up to 13.
  const cents = Math.round(value * 100) / 100;
  if (rounding === "whole") return Math.ceil(cents);
  if (rounding === "99") return Math.max(0.99, Math.ceil(cents) - 0.01);
  return cents;
}

/** Converts a home-currency amount into `currency`, with its markup and rounding. */
export function convertFromHome(amount: number, currency: DisplayCurrency): number {
  if (currency.rate === 1 && currency.markupPercent === 0) return amount;
  return applyRounding((amount / currency.rate) * (1 + currency.markupPercent / 100), currency.rounding);
}

/** Fixed prices the merchant set for a product, by currency. */
export type FixedPrices = Record<string, { price: number; compareAt: number | null }>;
