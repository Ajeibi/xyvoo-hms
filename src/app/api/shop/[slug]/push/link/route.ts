import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { pushSubscriptionSchema } from "@/lib/store/push";
import { linkPushDevice } from "@/lib/store/push-links";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Updates are offered for orders this recent. */
const ORDER_DAYS = 30;

const Schema = z.discriminatedUnion("kind", [
  /** "Get updates about this order on this device", by the order's unguessable id (as on its confirmation page). */
  z.object({ kind: z.literal("order"), endpoint: pushSubscriptionSchema.shape.endpoint, orderId: z.string().uuid() }),
  /** The basket being checked out on this device, by its checkout token, for a reminder if it's left. */
  z.object({ kind: z.literal("checkout"), endpoint: pushSubscriptionSchema.shape.endpoint, token: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/) }),
]);

/**
 * POST /api/shop/<store>/push/link — ties a device that already has this shop's
 * notifications (saved by POST /push) to an order or a basket, so it hears
 * when the order moves on, or gets a reminder about the basket.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await rateLimitShared(`push-link:${clientIp(req)}`, 30, 10 * 60_000)).ok) {
    return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });
  }
  const slug = (await params).slug;
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null;
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That request isn't valid." }, { status: 400 });

  const db = createServerSupabaseClient().schema("store");
  let refId: string | null = null;
  if (parsed.data.kind === "order") {
    const { data: order } = await db.from("orders").select("id, created_at").eq("tenant_id", tenant.id).eq("id", parsed.data.orderId).maybeSingle();
    if (order && Date.now() - new Date(order.created_at as string).getTime() < ORDER_DAYS * 86_400_000) refId = order.id as string;
  } else {
    const { data: checkout } = await db.from("checkouts").select("id").eq("tenant_id", tenant.id).eq("token", parsed.data.token).maybeSingle();
    refId = (checkout?.id as string | undefined) ?? null;
  }
  if (!refId) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const linked = await linkPushDevice(tenant.id, parsed.data.endpoint, parsed.data.kind, refId);
  return linked ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Turn on notifications first." }, { status: 409 });
}
