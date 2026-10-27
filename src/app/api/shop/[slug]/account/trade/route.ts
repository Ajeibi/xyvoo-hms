import { NextResponse } from "next/server";
import { formatShopCurrency } from "@/lib/shop/format";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { issueMessage, resolveShopForAccount, shopperMessage } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";
import { storeCurrency } from "@/lib/store/payout-routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { tradeApplicationSchema } from "@/lib/store/wholesale";
import { activeTrade, applyForTrade, getWholesaleSettings, tradeInfo, tradePricing, TradeError } from "@/lib/store/wholesale-server";

/**
 * GET /api/shop/<store>/account/trade — whether the shop takes trade
 * applications and where this shopper's stands.
 * GET /api/shop/<store>/account/trade?product=<id> — the trade price of one
 * product, only for a shopper with an approved trade account.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const shop = await resolveShopForAccount(req, slug, "trade", 120);
  if (shop.error) return shop.error;
  const noStore = { "Cache-Control": "no-store" };
  try {
    const session = await getCustomerSession(shop.tenant.id);
    const productId = new URL(req.url).searchParams.get("product");
    if (productId) {
      if (!(await activeTrade(shop.tenant.id, session))) return NextResponse.json({ trade: null }, { headers: noStore });
      const pricing = (await tradePricing(shop.tenant.id, [productId])).get(productId);
      if (!pricing?.wholesalePrice) return NextResponse.json({ trade: null }, { headers: noStore });
      const currency = await storeCurrency(shop.tenant.id, createServerSupabaseClient());
      const t = await shopperT(req, slug, shop.tenant.id);
      // As tradePriceText, in the shopper's words.
      const price = formatShopCurrency(pricing.wholesalePrice, currency);
      const text = pricing.minQty > 1 ? t("errors.acTradePriceFrom", { price, qty: pricing.minQty }) : t("errors.acTradePrice", { price });
      return NextResponse.json(
        { trade: { price: pricing.wholesalePrice, minQty: pricing.minQty, text } },
        { headers: noStore },
      );
    }
    const settings = await getWholesaleSettings(shop.tenant.id);
    if (!session?.verified || !settings.enabled) return NextResponse.json({ enabled: settings.enabled, status: "none" }, { headers: noStore });
    const info = await tradeInfo(session.account.id);
    return NextResponse.json({ enabled: true, minOrder: settings.minOrder, ...info }, { headers: noStore });
  } catch (error) {
    console.error("[trade] failed", error);
    return NextResponse.json({ enabled: false, status: "none" });
  }
}

/** POST /api/shop/<store>/account/trade { business, about } — apply for a trade account. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const shop = await resolveShopForAccount(req, slug, "trade-apply", 6);
  if (shop.error) return shop.error;
  const t = await shopperT(req, slug, shop.tenant.id);
  const session = await getCustomerSession(shop.tenant.id);
  if (!session?.verified) return NextResponse.json({ error: t("errors.acConfirmEmailFirst") }, { status: 401 });
  const parsed = tradeApplicationSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: issueMessage(t, parsed.error.issues[0], "errors.acCheckDetails") }, { status: 400 });
  try {
    await applyForTrade(shop.tenant.id, session.account, parsed.data);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof TradeError) return NextResponse.json({ error: shopperMessage(t, error.message) }, { status: 409 });
    console.error("[trade] apply failed", error);
    return NextResponse.json({ error: t("errors.acTradeFailed") }, { status: 500 });
  }
}
