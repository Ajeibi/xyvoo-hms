import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { reminderBasket, stopCartReminders } from "@/lib/store/cart-reminders";
import { requestT } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";

const shopFor = async (slug: string) => (/^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null);

/**
 * GET /api/shop/<store>/reminders?k=<key> — the basket from a reminder email,
 * rebuilt from today's products, so the cart page can put it back.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (!(await rateLimitShared(`reminder-basket:${clientIp(req)}`, 30, 60_000)).ok) {
    return NextResponse.json({ error: (await requestT(req, slug))("errors.acTooManyRequests") }, { status: 429 });
  }
  const tenant = await shopFor(slug);
  const reminderKey = new URL(req.url).searchParams.get("k") || "";
  if (!tenant) return NextResponse.json({ error: (await requestT(req, slug))("errors.acShopNotFound") }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);

  try {
    const lines = await reminderBasket(tenant.id, reminderKey);
    if (!lines) return NextResponse.json({ error: t("errors.acBasketNotFound") }, { status: 404 });
    return NextResponse.json({ lines });
  } catch (error) {
    console.error("[reminder basket] failed", error);
    return NextResponse.json({ error: t("errors.acBasketLoadFailed") }, { status: 500 });
  }
}

/**
 * POST /api/shop/<store>/reminders?k=<key> — stop basket reminders. Used by the
 * "stop reminders" page and by mail apps' one-click unsubscribe
 * (List-Unsubscribe-Post), which posts a form with no other details.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  if (!(await rateLimitShared(`reminder-stop:${clientIp(req)}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: (await requestT(req, slug))("errors.acTooManyRequests") }, { status: 429 });
  }
  const tenant = await shopFor(slug);
  if (!tenant) return NextResponse.json({ error: (await requestT(req, slug))("errors.acShopNotFound") }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);

  let reminderKey = new URL(req.url).searchParams.get("k") || "";
  if (!reminderKey && req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => null);
    reminderKey = typeof body?.key === "string" ? body.key : "";
  }

  try {
    if (!(await stopCartReminders(tenant.id, reminderKey))) return NextResponse.json({ error: t("errors.acReminderNotFound") }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reminder stop] failed", error);
    return NextResponse.json({ error: t("errors.acSaveFailed") }, { status: 500 });
  }
}
