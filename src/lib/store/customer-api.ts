import { NextResponse } from "next/server";
import { getShopTenantBySlug, type ShopTenant } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { isShopLive } from "./site/data";

/** The live shop for a shopper account request, or an error response. Rate limited per visitor and action. */
export async function resolveShopForAccount(
  req: Request,
  slug: string,
  action: string,
  limit = 20,
): Promise<{ tenant: ShopTenant; error?: undefined } | { error: NextResponse; tenant?: undefined }> {
  if (!(await rateLimitShared(`account-${action}:${clientIp(req)}`, limit, 10 * 60_000)).ok) {
    return { error: NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 }) };
  }
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null;
  if (!tenant || !(await isShopLive(tenant.id))) return { error: NextResponse.json({ error: "Shop not found." }, { status: 404 }) };
  return { tenant };
}
