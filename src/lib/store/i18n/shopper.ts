import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getShopSnapshot } from "@/lib/store/site/shop-cache";
import { isShopLanguage, pickShopLanguage, shopLanguageCookie, shopLanguages, STOREFRONT_LANG_HEADER, type ShopLanguage } from "./languages";
import { wordsFor } from "./messages";
import { createTranslator, type Translator } from "./translate";

/*
 * The shopper's language outside a page render:
 *   - API routes (error messages): the language they chose, from their cookie
 *     (or ?lang= on the request), if the shop offers it
 *   - emails sent later (order updates, reminders): the language saved with the
 *     order, basket, request or account, if the shop still offers it
 * Either way, the shop's main language otherwise.
 */

/** The languages a shop offers, its main one first (from its published site, kept in the shop cache). */
export async function offeredLanguages(tenantId: string): Promise<ShopLanguage[]> {
  try {
    const content = (await getShopSnapshot(tenantId)).site?.published?.content;
    return shopLanguages(content?.language, content?.languages);
  } catch {
    return shopLanguages(undefined, undefined);
  }
}

/** The language a shopper's request is in. */
export async function requestLanguage(req: Request, slug: string, tenantId: string): Promise<ShopLanguage> {
  const offered = await offeredLanguages(tenantId);
  const fromHeader = req.headers.get(STOREFRONT_LANG_HEADER);
  let fromCookie: string | undefined;
  try {
    fromCookie = (await cookies()).get(shopLanguageCookie(slug))?.value;
  } catch {
    fromCookie = undefined;
  }
  return pickShopLanguage(offered, fromHeader, fromCookie);
}

/** Words for an API route's messages to the shopper: const t = await shopperT(req, slug, tenant.id). */
export async function shopperT(req: Request, slug: string, tenantId: string): Promise<Translator> {
  return translatorFor(await requestLanguage(req, slug, tenantId));
}

/** The language for an email: the one saved with the shopper's order, basket or account, if the shop still offers it. */
export async function emailLanguage(tenantId: string, saved: unknown): Promise<ShopLanguage> {
  const offered = await offeredLanguages(tenantId);
  return isShopLanguage(saved) && offered.includes(saved) ? saved : offered[0];
}

/** Words for an email: const t = emailT(await emailLanguage(tenantId, order.language)). */
export const emailT = (lang: ShopLanguage) => translatorFor(lang);

/** A shop language's translator, for server code that already knows the language. */
export function translatorFor(lang: ShopLanguage): Translator {
  return createTranslator(lang, wordsFor(lang, "all"));
}

/**
 * Saves the shopper's language with their order, basket, request or account, so later emails use it.
 * A separate write that never fails the request (the column comes with a migration).
 */
export async function saveShopperLanguage(table: "orders" | "checkouts" | "stock_alerts" | "customer_accounts", tenantId: string, match: { id: string } | { token: string }, lang: ShopLanguage) {
  try {
    const [column, value] = "id" in match ? ["id", match.id] : ["token", match.token];
    const { error } = await createServerSupabaseClient().schema("store").from(table).update({ language: lang }).eq("tenant_id", tenantId).eq(column, value);
    if (error && error.code !== "42703" && error.code !== "PGRST204") console.error("[shopper language] not saved", { table, error: error.message });
  } catch (error) {
    console.error("[shopper language] not saved", { table, error });
  }
}
