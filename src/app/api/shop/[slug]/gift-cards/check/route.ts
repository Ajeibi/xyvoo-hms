import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { checkGiftCard, GIFT_CARD_PROBLEMS } from "@/lib/store/gift-cards";
import { shopperT } from "@/lib/store/i18n/shopper";
import type { Translator } from "@/lib/store/i18n/translate";

const bodySchema = (t: Translator) => z.object({ code: z.string().trim().min(1, t("errors.coEnterGiftCardCode")).max(40) });

/** checkGiftCard's English answer in the shopper's words (as it is, if it's one this doesn't know). */
function giftCardProblem(t: Translator, message: string) {
  if (message === GIFT_CARD_PROBLEMS.not_found) return t("errors.coGiftCardNotFound");
  if (message === GIFT_CARD_PROBLEMS.disabled) return t("errors.coGiftCardDisabled");
  if (message === GIFT_CARD_PROBLEMS.expired) return t("errors.coGiftCardExpired");
  if (message === GIFT_CARD_PROBLEMS.empty) return t("errors.coGiftCardEmpty");
  if (message.startsWith("Gift card codes have 16 letters")) return t("errors.coGiftCardCodeFormat");
  return message;
}

/**
 * POST /api/shop/<store>/gift-cards/check { code } — what's left on a gift
 * card, so checkout can show it before the order is placed. Kept to a few
 * tries per visitor, so codes can't be guessed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await resolveShopForAccount(req, slug, "gift-card-check", 10);
  if (shop.error) return shop.error;
  const t = await shopperT(req, slug, shop.tenant.id);
  const parsed = bodySchema(t).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || t("errors.coEnterGiftCardCode") }, { status: 400 });

  const result = await checkGiftCard(shop.tenant.id, parsed.data.code);
  if (!result.ok) return NextResponse.json({ error: giftCardProblem(t, result.message) }, { status: 404 });
  return NextResponse.json({ code: result.code, balance: result.balance, currency: result.currency, expiresAt: result.expiresAt });
}
