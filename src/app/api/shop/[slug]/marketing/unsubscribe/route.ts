import { NextResponse } from "next/server";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { unsubscribeByKey } from "@/lib/store/campaigns-server";

/**
 * POST /api/shop/<store>/marketing/unsubscribe?k=<key>&r=<token> — stop marketing
 * emails. Used by the unsubscribe page and by mail apps' one-click unsubscribe
 * (List-Unsubscribe-Post), which posts a form with no other details.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await rateLimitShared(`unsubscribe:${clientIp(req)}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const tenant = await getShopTenantBySlug((await params).slug);
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const url = new URL(req.url);
  let key = url.searchParams.get("k") || "";
  let token = url.searchParams.get("r");
  if (!key && req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => null);
    key = typeof body?.key === "string" ? body.key : "";
    token = typeof body?.token === "string" ? body.token : token;
  }
  try {
    if (!(await unsubscribeByKey(tenant.id, key, token))) return NextResponse.json({ error: "We couldn't find that sign-up." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[unsubscribe] failed", error);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
}
