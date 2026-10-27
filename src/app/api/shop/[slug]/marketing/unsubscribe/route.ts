import { NextResponse } from "next/server";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { unsubscribeByKey } from "@/lib/store/campaigns-server";
import { requestT } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";

/**
 * POST /api/shop/<store>/marketing/unsubscribe?k=<key>&r=<token> — stop marketing
 * emails. Used by the unsubscribe page and by mail apps' one-click unsubscribe
 * (List-Unsubscribe-Post), which posts a form with no other details.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (!(await rateLimitShared(`unsubscribe:${clientIp(req)}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: (await requestT(req, slug))("errors.acTooManyRequests") }, { status: 429 });
  }
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: (await requestT(req, slug))("errors.acShopNotFound") }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);

  const url = new URL(req.url);
  let key = url.searchParams.get("k") || "";
  let token = url.searchParams.get("r");
  if (!key && req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => null);
    key = typeof body?.key === "string" ? body.key : "";
    token = typeof body?.token === "string" ? body.token : token;
  }
  try {
    if (!(await unsubscribeByKey(tenant.id, key, token))) return NextResponse.json({ error: t("errors.acSignupNotFound") }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[unsubscribe] failed", error);
    return NextResponse.json({ error: t("errors.acSaveFailed") }, { status: 500 });
  }
}
