import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { reminderBasket, stopCartReminders } from "@/lib/store/cart-reminders";

const shopFor = async (slug: string) => (/^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null);

/**
 * GET /api/shop/<store>/reminders?k=<key> — the basket from a reminder email,
 * rebuilt from today's products, so the cart page can put it back.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await rateLimitShared(`reminder-basket:${clientIp(req)}`, 30, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const tenant = await shopFor((await params).slug);
  const reminderKey = new URL(req.url).searchParams.get("k") || "";
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  try {
    const lines = await reminderBasket(tenant.id, reminderKey);
    if (!lines) return NextResponse.json({ error: "We couldn't find that basket." }, { status: 404 });
    return NextResponse.json({ lines });
  } catch (error) {
    console.error("[reminder basket] failed", error);
    return NextResponse.json({ error: "We couldn't load your basket just now." }, { status: 500 });
  }
}

/**
 * POST /api/shop/<store>/reminders?k=<key> — stop basket reminders. Used by the
 * "stop reminders" page and by mail apps' one-click unsubscribe
 * (List-Unsubscribe-Post), which posts a form with no other details.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await rateLimitShared(`reminder-stop:${clientIp(req)}`, 20, 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const tenant = await shopFor((await params).slug);
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  let reminderKey = new URL(req.url).searchParams.get("k") || "";
  if (!reminderKey && req.headers.get("content-type")?.includes("application/json")) {
    const body = await req.json().catch(() => null);
    reminderKey = typeof body?.key === "string" ? body.key : "";
  }

  try {
    if (!(await stopCartReminders(tenant.id, reminderKey))) return NextResponse.json({ error: "We couldn't find that reminder." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[reminder stop] failed", error);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
}
