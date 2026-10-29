import { requestLanguage, saveShopperLanguage, shopperT } from "@/lib/store/i18n/shopper";
import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { issueMessage, resolveShopForAccount } from "@/lib/store/customer-api";
import { pushSubscriptionSchema } from "@/lib/store/push";
import { linkPushDevice } from "@/lib/store/push-links";
import { requestStockAlert, stockAlertSchema } from "@/lib/store/stock-alerts";

/**
 * POST /api/shop/<store>/stock-alerts { productId, variantId?, email?, pushEndpoint? } —
 * "Email me when it's back". Signed-in shoppers don't need to type their email.
 * With pushEndpoint (a device that has this shop's notifications), it's a
 * notification on that device instead, and no email is needed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slugParam = (await params).slug;
  const shop = await resolveShopForAccount(req, slugParam, "stock-alert", 20);
  if (shop.error) return shop.error;
  const t = await shopperT(req, slugParam, shop.tenant.id);
  const body = await req.json().catch(() => null);
  const parsed = stockAlertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: issueMessage(t, parsed.error.issues[0], "errors.acCheckEmail") }, { status: 400 });
  const endpoint = pushSubscriptionSchema.shape.endpoint.safeParse(body?.pushEndpoint);
  const pushEndpoint = endpoint.success ? endpoint.data : null;

  const session = await getCustomerSession(shop.tenant.id);
  const email = pushEndpoint ? null : parsed.data.email || session?.account.email;
  if (!email && !pushEndpoint) return NextResponse.json({ error: t("errors.acEnterEmail") }, { status: 400 });

  try {
    const saved = await requestStockAlert(shop.tenant.id, {
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      email: email ?? null,
      name: email && session?.account.email === email ? session.account.name : null,
      accountId: session?.account.id ?? null,
    });
    if (!saved) return NextResponse.json({ error: t("errors.acProductNotFound") }, { status: 404 });
    // The "it's back" email or notification comes in the shopper's language.
    await saveShopperLanguage("stock_alerts", shop.tenant.id, { id: saved }, await requestLanguage(req, slugParam, shop.tenant.id));
    if (pushEndpoint && !(await linkPushDevice(shop.tenant.id, pushEndpoint, "stock_alert", saved))) {
      return NextResponse.json({ error: t("errors.acPushTurnOnShop") }, { status: 409 });
    }
    return NextResponse.json({ ok: true, email, push: Boolean(pushEndpoint) });
  } catch (error) {
    console.error("[stock alert] not saved", error);
    return NextResponse.json({ error: t("errors.acSaveFailed") }, { status: 500 });
  }
}
