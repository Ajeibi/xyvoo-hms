import type { ShopLanguage } from "./languages";

/**
 * One area's words in every shop language. The English words set the list of
 * keys, and every other language must have exactly the same keys.
 *
 * Plurals: give `name_one` and `name_other` (and call t("area.name", { count })).
 * Placeholders: {name} in the words, filled from t()'s second argument.
 */
export function defineMessages<const E extends Record<string, string>>(messages: { en: E } & { [L in Exclude<ShopLanguage, "en">]: { [K in keyof E]: string } }) {
  return messages;
}
