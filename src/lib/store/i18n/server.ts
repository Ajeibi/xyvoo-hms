import { wordsFor } from "./messages";
import { createTranslator } from "./translate";
import type { ShopLanguage } from "./languages";

/** The shop's words in the shopper's language, for server pages: const t = getShopT(storefront). */
export function getShopT(storefront: { language: ShopLanguage }) {
  return createTranslator(storefront.language, wordsFor(storefront.language, "all"));
}
