import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { checkoutSessionSchema, saveCheckoutSession } from "@/lib/store/checkouts";

/**
 * POST /api/shop/<store>/checkout-session — saves the basket and contact
 * details while a shopper fills in checkout, so the shop can follow up if they
 * don't finish. The checkout page tells shoppers this happens.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!rateLimit(`checkout-session:${clientIp(req)}`, 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const slug = (await params).slug;
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null;
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const parsed = checkoutSessionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  try {
    const saved = await saveCheckoutSession(tenant.id, parsed.data);
    return NextResponse.json({ ok: true, saved });
  } catch (error) {
    console.error("[checkout-session] not saved", error);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
