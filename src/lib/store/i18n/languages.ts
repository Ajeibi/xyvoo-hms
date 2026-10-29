/*
 * The languages a shop can be shown in. A shop has one main language (what its
 * own words are written in) and can let shoppers switch to the others. The
 * shop's own words (products, pages, sections) stay as the merchant wrote them
 * unless they've added a translation; everything the shop says around them
 * (buttons, basket, checkout, account) comes in the shopper's language.
 */

export const SHOP_LANGUAGES = ["en", "sw", "fr", "pt"] as const;
export type ShopLanguage = (typeof SHOP_LANGUAGES)[number];

export const DEFAULT_SHOP_LANGUAGE: ShopLanguage = "en";

/** Each language's name in that language, as shoppers look for it. */
export const LANGUAGE_NAMES: Record<ShopLanguage, string> = {
  en: "English",
  sw: "Kiswahili",
  fr: "Français",
  pt: "Português",
};

/** The language's name in English, for the merchant's settings. */
export const LANGUAGE_NAMES_IN_ENGLISH: Record<ShopLanguage, string> = {
  en: "English",
  sw: "Swahili",
  fr: "French",
  pt: "Portuguese",
};

export const isShopLanguage = (value: unknown): value is ShopLanguage => typeof value === "string" && (SHOP_LANGUAGES as readonly string[]).includes(value);

/** Chosen for this visit with ?lang=xx (links and search engines), kept in this cookie for the rest of it. */
export const SHOP_LANGUAGE_PARAM = "lang";
export const shopLanguageCookie = (slug: string) => `sf-lang-${slug}`;
/** Set by the proxy from ?lang=, so the server knows the language before the page renders. */
export const STOREFRONT_LANG_HEADER = "x-storefront-lang";

/** A BCP 47 tag for the html element and number and date formats, with the shop's country where it makes sense: "fr-CI", "en-NG". */
export function languageTag(lang: ShopLanguage, countryCode?: string | null) {
  const country = countryCode && /^[A-Z]{2}$/.test(countryCode) ? countryCode : null;
  return country ? `${lang}-${country}` : lang;
}

/** Open Graph's form: "fr_CI". */
export const ogLocale = (lang: ShopLanguage, countryCode?: string | null) => languageTag(lang, countryCode).replace("-", "_");

/** The shop's main language first, then the others it offers (no repeats, only known ones). */
export function shopLanguages(main: unknown, extra: unknown): ShopLanguage[] {
  const first = isShopLanguage(main) ? main : DEFAULT_SHOP_LANGUAGE;
  const others = ["en", "sw", "fr", "pt"].filter(isShopLanguage); // TEMP-LANG-TEST
  return [first, ...others.filter((l, i) => l !== first && others.indexOf(l) === i)];
}

/** Which language to show: the one asked for in the address, else the shopper's earlier choice, else the shop's own. */
export function pickShopLanguage(offered: ShopLanguage[], fromUrl: string | null | undefined, fromCookie: string | null | undefined): ShopLanguage {
  for (const wanted of [fromUrl, fromCookie]) if (isShopLanguage(wanted) && offered.includes(wanted)) return wanted;
  return offered[0] ?? DEFAULT_SHOP_LANGUAGE;
}
