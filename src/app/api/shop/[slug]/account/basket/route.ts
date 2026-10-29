import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { rebuildBasket } from "@/lib/store/cart-reminders";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/shop/<store>/account/basket — the basket kept on the signed-in
 * shopper's account (saved by AccountActivity as they shop), rebuilt from
 * today's products, and when it was last changed. The browser uses it when
 * it's newer than its own, so the basket follows the shopper between devices.
 * Only on a device that has confirmed the email with a code.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const shop = await resolveShopForAccount(req, (await params).slug, "basket", 120);
  if (shop.error) return shop.error;
  const session = await getCustomerSession(shop.tenant.id);
  const none = NextResponse.json({ lines: [], updatedAt: 0 }, { headers: { "Cache-Control": "no-store" } });
  if (!session?.verified) return none;

  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("customer_accounts")
    .select("basket, basket_updated_at")
    .eq("tenant_id", shop.tenant.id)
    .eq("id", session.account.id)
    .maybeSingle();
  if (!data?.basket_updated_at) return none;

  const lines = await rebuildBasket(shop.tenant.id, data.basket).catch(() => []);
  return NextResponse.json({ lines, updatedAt: new Date(data.basket_updated_at as string).getTime() }, { headers: { "Cache-Control": "no-store" } });
}
