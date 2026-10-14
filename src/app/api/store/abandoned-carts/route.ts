import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { ABANDONED_AFTER_MINUTES, listAbandonedCheckouts, setCheckoutFollowUp, whatsappLink } from "@/lib/store/checkouts";
import { featureUnavailable } from "@/lib/store/features";
import { getCartReminderSetting, setCartReminderSetting } from "@/lib/store/cart-reminders";
import { formatShopCurrency } from "@/lib/shop/format";
import { storefrontUrl } from "@/lib/store/subdomain";

/** GET /api/store/abandoned-carts?slug= — checkouts shoppers didn't finish, for the shop to follow up by hand. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service } = resolved;
  if (!resolved.capabilities.canViewReports) return NextResponse.json({ error: "Only the owner or an admin can see abandoned carts." }, { status: 403 });
  const blocked = await featureUnavailable(access.tenantId, "abandonedCarts");
  if (blocked) return blocked;

  const [{ data: tenant }, { data: profile }] = await Promise.all([
    service.from("tenants").select("subdomain, name").eq("id", access.tenantId).maybeSingle(),
    service.schema("store").from("business_profile").select("country_code").eq("tenant_id", access.tenantId).maybeSingle(),
  ]);
  const shopUrl = storefrontUrl(String(tenant?.subdomain || tenant?.name || ""));
  const storeName = access.storeDisplayName;

  try {
    const [carts, reminders] = await Promise.all([listAbandonedCheckouts(access.tenantId), getCartReminderSetting(access.tenantId)]);
    return NextResponse.json({
      abandonedAfterMinutes: ABANDONED_AFTER_MINUTES,
      reminders,
      carts: carts.map((c) => {
        const first = c.name?.split(/\s+/)[0] || "there";
        const itemsText = c.items.map((i) => `${i.quantity} × ${i.name}`).join(", ");
        const message = `Hello ${first}, this is ${storeName}. We noticed you didn't finish your order (${itemsText}, ${formatShopCurrency(c.subtotal, c.currency)}). Can we help with anything? You can finish it here: ${shopUrl}/cart`;
        return {
          ...c,
          whatsappHref: whatsappLink(c.phone, message, profile?.country_code || "NG"),
          emailHref: c.email
            ? `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(`Your order at ${storeName}`)}&body=${encodeURIComponent(message)}`
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("[abandoned carts] failed", error);
    return NextResponse.json({ error: "We couldn't load abandoned carts just now." }, { status: 500 });
  }
}

const PatchSchema = z.object({ slug: z.string(), id: z.string().uuid(), followUp: z.enum(["none", "contacted", "recovered", "dismissed"]) });

/** PATCH /api/store/abandoned-carts { slug, id, followUp } — record that the shop followed up. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canViewReports) return NextResponse.json({ error: "Only the owner or an admin can update abandoned carts." }, { status: 403 });
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400 });

  await setCheckoutFollowUp(resolved.access.tenantId, parsed.data.id, parsed.data.followUp);
  return NextResponse.json({ ok: true });
}

const ReminderSchema = z.object({ slug: z.string(), reminders: z.union([z.literal(0), z.literal(1), z.literal(2)]) });

/** PUT /api/store/abandoned-carts { slug, reminders: 0 | 1 | 2 } — how many automatic email reminders to send. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canViewReports) return NextResponse.json({ error: "Only the owner or an admin can change basket reminders." }, { status: 403 });
  const parsed = ReminderSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400 });

  try {
    await setCartReminderSetting(resolved.access.tenantId, parsed.data.reminders);
    return NextResponse.json({ ok: true, reminders: parsed.data.reminders });
  } catch (error) {
    console.error("[cart reminders] setting not saved", error);
    return NextResponse.json({ error: "We couldn't save that just now. Please try again." }, { status: 500 });
  }
}
