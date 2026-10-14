import { NextResponse } from "next/server";
import { z } from "zod";
import { accountBasketSchema, getCustomerSession, recordProductView, saveAccountBasket } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";

const BodySchema = z.union([z.object({ productId: z.string().uuid() }), z.object({ basket: accountBasketSchema })]);

/**
 * POST /api/shop/<store>/account/activity { productId } | { basket } — what a
 * signed-in shopper looks at and has in their basket, so the shop can help
 * them. Shoppers are told this when they create an account. Always 204.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const done = new NextResponse(null, { status: 204 });
  const shop = await resolveShopForAccount(req, (await params).slug, "activity", 300);
  if (shop.error) return done;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return done;
  const session = await getCustomerSession(shop.tenant.id);
  if (!session) return done;
  try {
    if ("productId" in parsed.data) await recordProductView(shop.tenant.id, session.account.id, parsed.data.productId);
    else await saveAccountBasket(shop.tenant.id, session.account.id, parsed.data.basket);
  } catch (error) {
    console.error("[account activity] not saved", error);
  }
  return done;
}
