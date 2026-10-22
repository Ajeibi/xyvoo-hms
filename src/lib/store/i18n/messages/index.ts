import type { ShopLanguage } from "../languages";
import { account } from "./account";
import { checkout } from "./checkout";
import { chrome } from "./chrome";
import { common } from "./common";
import { listing } from "./listing";
import { product } from "./product";

/*
 * Every word the shop says around the merchant's own content, by area:
 *   common    shared words (Close, Remove, Try again…)
 *   chrome    header, footer, menus, search, cookie banner, app prompt, 404
 *   product   product page, cards, gallery, reviews, back in stock
 *   listing   product lists, filters, collections, blog, contact and newsletter forms, homepage sections
 *   checkout  basket, basket drawer, checkout, order confirmation, gift cards
 *   account   shopper accounts, returns, unsubscribe and reminder pages
 * Server only: client components get their language's words from the layout.
 */
export const MESSAGES = { common, chrome, product, listing, checkout, account };

type Areas = typeof MESSAGES;
type FullKey = { [A in keyof Areas]: `${A & string}.${keyof Areas[A]["en"] & string}` }[keyof Areas];
type WithoutPlural<K> = K extends `${infer Base}_${"one" | "other"}` ? Base : K;
/** A word's key, e.g. "checkout.payNow". Plurals are named without their _one/_other ending. */
export type MessageKey = WithoutPlural<FullKey>;

const cache = new Map<ShopLanguage, Record<string, string>>();

/** All of a language's words, flattened to "area.key". */
export function wordsFor(lang: ShopLanguage): Record<string, string> {
  let words = cache.get(lang);
  if (!words) {
    words = {};
    for (const [area, messages] of Object.entries(MESSAGES)) {
      for (const [key, value] of Object.entries((messages as Record<ShopLanguage, Record<string, string>>)[lang])) words[`${area}.${key}`] = value;
    }
    cache.set(lang, words);
  }
  return words;
}
