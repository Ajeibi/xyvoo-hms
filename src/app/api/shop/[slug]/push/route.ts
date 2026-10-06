import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { getPushConfig, pushSubscriptionSchema, removePushSubscription, savePushSubscription } from "@/lib/store/push";
import { getStoreSite } from "@/lib/store/site/data";

/**
 * POST   /api/shop/<store>/push  { subscription }  turn on a store's notifications
 * DELETE /api/shop/<store>/push  { endpoint }      turn them off
 * Public (shoppers have no account), so rate-limited per IP address, and only
 * for stores that are live.
 */

async function liveStore(slug: string) {
  if (!/^[a-z0-9-]{1,63}$/i.test(slug)) return null;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return null;
  const site = await getStoreSite(tenant.id);
  return site?.status === "live" ? tenant : null;
}

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!getPushConfig()) return NextResponse.json({ error: "Notifications aren't available yet." }, { status: 503 });
  if (!rateLimit(`push-subscribe:${clientIp(req)}`, 20, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }

  const tenant = await liveStore((await params).slug);
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = pushSubscriptionSchema.safeParse(body?.subscription);
  if (!parsed.success) return NextResponse.json({ error: "That subscription isn't valid." }, { status: 400 });

  await savePushSubscription(tenant.id, parsed.data, req.headers.get("user-agent"));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!rateLimit(`push-unsubscribe:${clientIp(req)}`, 30, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const slug = (await params).slug;
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null;
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const parsed = z.object({ endpoint: pushSubscriptionSchema.shape.endpoint }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing subscription." }, { status: 400 });

  await removePushSubscription(tenant.id, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
