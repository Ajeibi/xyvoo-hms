import { NextResponse } from "next/server";
import {
  accountOrders,
  accountUpdateSchema,
  customerCookieName,
  endCustomerSession,
  getCustomerSession,
  lastShippingAddress,
  updateAccount,
} from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { getLoyaltySettings, loyaltyBalance, loyaltyHistory } from "@/lib/store/loyalty-server";

type Params = { params: Promise<{ slug: string }> };

/**
 * GET /api/shop/<store>/account[?orders=1] — the signed-in shopper, or
 * { account: null }. Orders and the last delivery address are only included on
 * a device that confirmed the email with a code.
 */
export async function GET(req: Request, { params }: Params) {
  const shop = await resolveShopForAccount(req, (await params).slug, "me", 240);
  if (shop.error) return shop.error;
  const session = await getCustomerSession(shop.tenant.id);
  if (!session) return NextResponse.json({ account: null }, { headers: { "Cache-Control": "no-store" } });

  const wantOrders = new URL(req.url).searchParams.get("orders") === "1";
  const [orders, address] = session.verified
    ? await Promise.all([wantOrders ? accountOrders(shop.tenant.id, session.account) : Promise.resolve(null), lastShippingAddress(shop.tenant.id, session.account)])
    : [null, null];
  // Points only show on a device that confirmed the email with a code.
  const loyaltySettings = await getLoyaltySettings(shop.tenant.id).catch(() => null);
  const loyalty =
    session.verified && loyaltySettings?.enabled
      ? {
          balance: await loyaltyBalance(session.account.id).catch(() => 0),
          pointValue: loyaltySettings.pointValue,
          minRedeem: loyaltySettings.minRedeem,
          pointsPer100: loyaltySettings.pointsPer100,
          history: new URL(req.url).searchParams.get("loyalty") === "1" ? await loyaltyHistory(session.account.id, 15).catch(() => []) : undefined,
        }
      : null;
  return NextResponse.json(
    {
      loyalty,
      account: {
        name: session.account.name,
        email: session.account.email,
        phone: session.account.phone,
        contactConsent: session.account.contactConsent,
        confirmed: session.verified,
      },
      address,
      orders,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/** PATCH /api/shop/<store>/account { name?, phone?, consent? } — update your details. */
export async function PATCH(req: Request, { params }: Params) {
  const shop = await resolveShopForAccount(req, (await params).slug, "update");
  if (shop.error) return shop.error;
  const session = await getCustomerSession(shop.tenant.id);
  if (!session) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = accountUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your details." }, { status: 400 });
  try {
    await updateAccount(shop.tenant.id, session.account.id, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[account] not updated", error);
    return NextResponse.json({ error: "We couldn't save your details just now. Please try again." }, { status: 500 });
  }
}

/** DELETE /api/shop/<store>/account — sign out on this device. */
export async function DELETE(req: Request, { params }: Params) {
  const shop = await resolveShopForAccount(req, (await params).slug, "signout");
  if (shop.error) return shop.error;
  const session = await getCustomerSession(shop.tenant.id);
  if (session) await endCustomerSession(shop.tenant.id, session.sessionId);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(customerCookieName(shop.tenant.id), "", { path: "/", maxAge: 0 });
  return res;
}
