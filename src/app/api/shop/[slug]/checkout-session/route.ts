import { requestLanguage, saveShopperLanguage, shopperT } from "@/lib/store/i18n/shopper";
import { after, NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { checkoutSessionSchema, saveCheckoutSession } from "@/lib/store/checkouts";
import { runCartRemindersIfDue } from "@/lib/store/cart-reminders";
import { runStockAlertsIfDue } from "@/lib/store/stock-alerts";
import { runGiftCardEmailsIfDue } from "@/lib/store/gift-cards";
import { runCampaignsIfDue } from "@/lib/store/campaigns-server";
import { isShopLive } from "@/lib/store/site/data";

/**
 * POST /api/shop/<store>/checkout-session — saves the basket and contact
 * details while a shopper fills in checkout, so the shop can follow up if they
 * don't finish. The checkout page tells shoppers this happens.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await rateLimitShared(`checkout-session:${clientIp(req)}`, 30, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const slug = (await params).slug;
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null;
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  if (!(await isShopLive(tenant.id))) return NextResponse.json({ error: (await shopperT(req, slug, tenant.id))("errors.coShopNotFound") }, { status: 404 });

  const parsed = checkoutSessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const saved = await saveCheckoutSession(tenant.id, parsed.data);
    // So a reminder about this basket is in the shopper's language.
    if (saved) await saveShopperLanguage("checkouts", tenant.id, { token: parsed.data.token }, await requestLanguage(req, slug, tenant.id));
    // A good moment to send any basket reminders that are due (at most every ten minutes).
    after(runCartRemindersIfDue);
  after(runStockAlertsIfDue);
  after(runGiftCardEmailsIfDue);
  after(runCampaignsIfDue);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    console.error("[checkout-session] not saved", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
