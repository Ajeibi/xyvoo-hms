import type { ShopLanguage } from "../languages";
import { account } from "./account";
import { checkout } from "./checkout";
import { chrome } from "./chrome";
import { common } from "./common";
import { emails } from "./emails";
import { errors } from "./errors";
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
 *   errors    messages the shop's API sends back to shoppers (server only)
 *   emails    emails to shoppers (server only)
 * Server only: client components get their language's words from the layout.
 */
export const MESSAGES = { common, chrome, product, listing, checkout, account, errors, emails };

/** Areas only the server uses: left out of the words each page sends to the browser. */
const SERVER_ONLY = new Set<string>(["errors", "emails"]);

type Areas = typeof MESSAGES;
type FullKey = { [A in keyof Areas]: `${A & string}.${keyof Areas[A]["en"] & string}` }[keyof Areas];
type WithoutPlural<K> = K extends `${infer Base}_${"one" | "other"}` ? Base : K;
/** A word's key, e.g. "checkout.payNow". Plurals are named without their _one/_other ending. */
export type MessageKey = WithoutPlural<FullKey>;

const cache = new Map<string, Record<string, string>>();

/**
 * A language's words, flattened to "area.key". By default the ones pages use (sent to the browser);
 * "all" adds the server-only areas, for API routes and emails.
 */
export function wordsFor(lang: ShopLanguage, scope: "page" | "all" = "page"): Record<string, string> {
  const id = `${lang}:${scope}`;
  let words = cache.get(id);
  if (!words) {
    words = {};
    for (const [area, messages] of Object.entries(MESSAGES)) {
      if (scope === "page" && SERVER_ONLY.has(area)) continue;
      for (const [key, value] of Object.entries((messages as Record<ShopLanguage, Record<string, string>>)[lang])) words[`${area}.${key}`] = value;
    }
    cache.set(id, words);
  }
  return words;
}
