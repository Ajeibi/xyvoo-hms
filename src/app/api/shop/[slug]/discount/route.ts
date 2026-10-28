import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { isShopLive } from "@/lib/store/site/data";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { checkDiscount, describeDiscount } from "@/lib/store/discounts";
import { countDiscountUses, discountProblem, discountProductIds, findDiscountByCode, priceBasketLines } from "@/lib/store/discounts-server";
import { formatShopCurrency } from "@/lib/shop/format";
import { storeCurrency } from "@/lib/store/payout-routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { shopperT } from "@/lib/store/i18n/shopper";
import type { Translator } from "@/lib/store/i18n/translate";

const bodySchema = (t: Translator) =>
  z.object({
    code: z.string().trim().min(1, t("errors.coEnterDiscountCode")).max(40),
    items: z
      .array(z.object({ productId: z.string().uuid(), variantId: z.string().uuid().nullable().optional(), quantity: z.number().int().positive().max(999) }))
      .min(1, t("errors.coAddToBasketFirst"))
      .max(50, t("errors.coTooManyItems")),
  });

/**
 * POST /api/shop/<store>/discount { code, items } — checks a code against the
 * basket and says what it takes off, or that it gives free delivery
 * (freeDelivery: true, amount 0). Checked again when the order is placed;
 * per-customer limits can only be checked then, once we have their email.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);
  if (!(await isShopLive(tenant.id))) return NextResponse.json({ error: t("errors.coShopNotFound") }, { status: 404 });
  // Low enough that guessing codes isn't practical, high enough for a shopper trying a few.
  const limit = await rateLimitShared(`discount:${tenant.id}:${clientIp(req)}`, 15, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: t("errors.coTooManyDiscountTries") }, { status: 429 });

  const parsed = bodySchema(t).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || t("errors.coEnterDiscountCode") }, { status: 400 });

  const code = await findDiscountByCode(tenant.id, parsed.data.code);
  if (!code) return NextResponse.json({ error: t("errors.coCodeInvalid") }, { status: 404 });

  const currency = await storeCurrency(tenant.id, createServerSupabaseClient());
  const money = (amount: number) => formatShopCurrency(amount, currency);
  const [lines, eligible, uses] = await Promise.all([priceBasketLines(tenant.id, parsed.data.items), discountProductIds(code), countDiscountUses(tenant.id, [code.id])]);
  if (code.usageLimit != null && (uses.get(code.id) ?? 0) >= code.usageLimit) {
    return NextResponse.json({ error: t("errors.coCodeUsedUp") }, { status: 409 });
  }
  const result = checkDiscount(code, lines, eligible, new Date(), money);
  if (!result.ok) return NextResponse.json({ error: discountProblem(t, result, code.minSubtotal, money) }, { status: 422 });

  // Which of the basket's own products the code covers, so the checkout page can
  // work out tax after the discount line by line (nothing outside the basket is shown).
  const inBasket = [...new Set(lines.map((l) => l.productId))];
  const appliesTo = eligible ? inBasket.filter((id) => eligible.includes(id)) : inBasket;
  return NextResponse.json({
    code: code.code,
    amount: result.amount,
    freeDelivery: result.freeDelivery,
    appliesTo,
    description: describeDiscount(code, money, t),
  });
}
