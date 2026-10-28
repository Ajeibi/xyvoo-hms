import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getShopTenantBySlug, type ShopTenant } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { isShopLanguage, shopLanguageCookie, STOREFRONT_LANG_HEADER, DEFAULT_SHOP_LANGUAGE } from "./i18n/languages";
import type { MessageKey } from "./i18n/messages";
import { translatorFor } from "./i18n/shopper";
import type { MessageVars, Translator } from "./i18n/translate";
import { isShopLive } from "./site/data";

/** The live shop for a shopper account request, or an error response. Rate limited per visitor and action. */
export async function resolveShopForAccount(
  req: Request,
  slug: string,
  action: string,
  limit = 20,
): Promise<{ tenant: ShopTenant; error?: undefined } | { error: NextResponse; tenant?: undefined }> {
  if (!(await rateLimitShared(`account-${action}:${clientIp(req)}`, limit, 10 * 60_000)).ok) {
    return { error: NextResponse.json({ error: (await requestT(req, slug))("errors.acTooManyAttempts") }, { status: 429 }) };
  }
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null;
  if (!tenant || !(await isShopLive(tenant.id))) return { error: NextResponse.json({ error: (await requestT(req, slug))("errors.acShopNotFound") }, { status: 404 }) };
  return { tenant };
}

/**
 * Words for a reply sent before the shop is known (rate limits, "Shop not
 * found"): the language the shopper chose, from ?lang= or their cookie, else
 * English. Once the shop is known, use shopperT, which also checks the shop
 * offers it and falls back to the shop's main language.
 */
export async function requestT(req: Request, slug: string): Promise<Translator> {
  let fromCookie: string | undefined;
  try {
    fromCookie = (await cookies()).get(shopLanguageCookie(slug))?.value;
  } catch {
    fromCookie = undefined;
  }
  const wanted = [req.headers.get(STOREFRONT_LANG_HEADER), fromCookie].find(isShopLanguage);
  return translatorFor(wanted ?? DEFAULT_SHOP_LANGUAGE);
}

type Words = MessageKey | readonly [MessageKey, MessageVars];

/**
 * The English messages of the validation rules and errors the shopper-facing
 * routes send back (from schemas and helpers in shared lib files), and the
 * same words in the shopper's language. The rules themselves stay where they are.
 */
const KNOWN_MESSAGES: Record<string, MessageKey> = {
  "Enter your name.": "errors.acEnterName",
  "Enter your email address.": "errors.acEnterEmail",
  "Enter an email address in the format name@example.com.": "errors.acEmailFormat",
  "Check your email address.": "errors.acCheckEmail",
  "Enter a phone number using digits only.": "errors.acPhoneDigits",
  "Enter the 6-digit code from the email.": "errors.acEnterCode",
  "That's longer than we can take. Please shorten it.": "errors.acTooLong",
  "Enter your message.": "errors.acEnterMessage",
  // Trade accounts (wholesale.ts, wholesale-server.ts)
  "Tell us the name of your business.": "errors.acTradeBusinessName",
  "Keep the business name under 120 characters.": "errors.acTradeBusinessLong",
  "Keep this under 500 characters.": "errors.acKeepUnder500",
  "This shop isn't taking trade applications right now.": "errors.acTradeOff",
  "Your application is already with the shop.": "errors.acTradePending",
  "You already have a trade account.": "errors.acTradeApproved",
  // Returns (returns.ts, returns-server.ts)
  "Choose what you'd like to return.": "errors.acReturnChooseItems",
  "Each item can only be listed once.": "errors.acReturnItemOnce",
  "Choose a reason.": "errors.acReturnChooseReason",
  "Keep your note under 500 characters.": "errors.acNoteUnder500",
  "We couldn't find that order.": "errors.acOrderNotFound",
  "You can ask to return an order once it has been delivered.": "errors.acReturnNotDelivered",
  "One of those items can't be returned, or its return window has closed.": "errors.acReturnNotReturnable",
  "Some of those items are already part of another return.": "errors.acReturnAlreadyInOther",
  "We couldn't start that return. Please try again.": "errors.acReturnNotStarted",
  // Reviews (reviews.ts)
  "This review link isn't valid.": "errors.acReviewLinkInvalid",
  "Tell us the name to show with your review.": "errors.acReviewName",
  "Choose a star rating.": "errors.acReviewRating",
  "Rate at least one item.": "errors.acReviewRateOne",
  // Payment proof (payment-proof.ts)
  "We couldn't upload that just now. Please try again.": "errors.acUploadFailed",
  "We couldn't save that just now. Please try again.": "errors.acSaveFailed",
};

/** "You can return up to 2 of “Blue shirt”." (returns-server.ts) */
const RETURN_UP_TO = /^You can return up to (\d+) of “(.*)”\.$/;

function knownWords(message: string, extra?: Record<string, Words>): Words | undefined {
  const found = extra?.[message] ?? KNOWN_MESSAGES[message];
  if (found) return found;
  const upTo = RETURN_UP_TO.exec(message);
  if (upTo) return ["errors.acReturnUpTo", { count: Number(upTo[1]), name: upTo[2] }];
  return undefined;
}

const say = (t: Translator, words: Words) => (typeof words === "string" ? t(words) : t(words[0], words[1]));

/**
 * A message from a shared lib (a thrown error's, a helper's) in the shopper's
 * language. One we don't know is passed on as it is.
 */
export function shopperMessage(t: Translator, message: string, extra?: Record<string, Words>): string {
  const words = knownWords(message, extra);
  return words ? say(t, words) : message;
}

/**
 * A failed parse's first problem in the shopper's words. Our own rule messages
 * are translated; anything else (zod's built-in wording) stays as it was in
 * English and becomes the fallback in other languages.
 */
export function issueMessage(t: Translator, issue: { message?: string } | undefined, fallback: MessageKey, extra?: Record<string, Words>): string {
  const words = issue?.message ? knownWords(issue.message, extra) : undefined;
  if (words) return say(t, words);
  if (t.lang === "en" && issue?.message) return issue.message;
  return t(fallback);
}
