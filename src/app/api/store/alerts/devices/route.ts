import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { rateLimit } from "@/lib/rate-limit";
import { removeMerchantDevice, saveMerchantDevice, sendMerchantPush } from "@/lib/store/merchant-alerts";
import { getPushConfig, pushSubscriptionSchema } from "@/lib/store/push";

/**
 * POST   /api/store/alerts/devices { slug, subscription, test? }  get the shop's alerts on this device
 * DELETE /api/store/alerts/devices { slug, endpoint }             stop them on this device
 * Any member of the store, for their own devices only.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access } = resolved;
  if (!getPushConfig()) return NextResponse.json({ error: "Alerts on devices aren't switched on yet. You'll still get them by email." }, { status: 503 });
  if (!rateLimit(`merchant-device:${access.userId}`, 20, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many attempts. Please try again later." }, { status: 429 });
  }

  const parsed = pushSubscriptionSchema.safeParse(body?.subscription);
  if (!parsed.success) return NextResponse.json({ error: "This browser didn't give us what we need. Please try again." }, { status: 400 });

  try {
    await saveMerchantDevice(access.tenantId, access.userId, parsed.data, req.headers.get("user-agent"));
    if (body?.test === true) {
      await sendMerchantPush(
        access.tenantId,
        { title: `Alerts are on for ${access.storeDisplayName}`, body: "You'll get a notification like this when a new order comes in.", path: `/storefront/${encodeURIComponent(body.slug)}/orders`, tag: "alerts-test" },
        access.userId,
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[alerts] device not saved", error);
    return NextResponse.json({ error: "We couldn't turn on alerts for this device. Please try again." }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const parsed = pushSubscriptionSchema.shape.endpoint.safeParse(body?.endpoint);
  if (!parsed.success) return NextResponse.json({ error: "Missing device." }, { status: 400 });
  try {
    await removeMerchantDevice(resolved.access.tenantId, resolved.access.userId, parsed.data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[alerts] device not removed", error);
    return NextResponse.json({ error: "We couldn't turn off alerts for this device. Please try again." }, { status: 500 });
  }
}
