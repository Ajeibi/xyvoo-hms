import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { requestStockAlert, stockAlertSchema } from "@/lib/store/stock-alerts";

/**
 * POST /api/shop/<store>/stock-alerts { productId, variantId?, email? } — "Email
 * me when it's back". Signed-in shoppers don't need to type their email.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const shop = await resolveShopForAccount(req, (await params).slug, "stock-alert", 20);
  if (shop.error) return shop.error;
  const parsed = stockAlertSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your email address." }, { status: 400 });

  const session = await getCustomerSession(shop.tenant.id);
  const email = parsed.data.email || session?.account.email;
  if (!email) return NextResponse.json({ error: "Enter your email address." }, { status: 400 });

  try {
    const saved = await requestStockAlert(shop.tenant.id, {
      productId: parsed.data.productId,
      variantId: parsed.data.variantId,
      email,
      name: session?.account.email === email ? session.account.name : null,
      accountId: session?.account.email === email ? session.account.id : null,
    });
    if (!saved) return NextResponse.json({ error: "We couldn't find that product." }, { status: 404 });
    return NextResponse.json({ ok: true, email });
  } catch (error) {
    console.error("[stock alert] not saved", error);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
}
