import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";
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
  const shop = await resolveShopForAccount(req, (await params).slug, "stock-alert", 20);
  if (shop.error) return shop.error;
  const body = await req.json().catch(() => null);
  const parsed = stockAlertSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your email address." }, { status: 400 });
  const endpoint = pushSubscriptionSchema.shape.endpoint.safeParse(body?.pushEndpoint);
  const pushEndpoint = endpoint.success ? endpoint.data : null;

  const session = await getCustomerSession(shop.tenant.id);
  const email = pushEndpoint ? null : parsed.data.email || session?.account.email;
  if (!email && !pushEndpoint) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });

  try {
    const saved = await requestStockAlert(shop.tenant.id, {
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      email: email ?? null,
      name: email && session?.account.email === email ? session.account.name : null,
      accountId: session?.account.id ?? null,
    });
    if (!saved) return NextResponse.json({ error: "We couldn't find that product." }, { status: 404 });
    if (pushEndpoint && !(await linkPushDevice(shop.tenant.id, pushEndpoint, "stock_alert", saved))) {
      return NextResponse.json({ error: "Turn on notifications for this shop first." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, email, push: Boolean(pushEndpoint) });
  } catch (error) {
    console.error("[stock alert] not saved", error);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
}
