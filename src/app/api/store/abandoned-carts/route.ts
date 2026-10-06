import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { ABANDONED_AFTER_MINUTES, listAbandonedCheckouts, setCheckoutFollowUp, whatsappLink } from "@/lib/store/checkouts";
import { featureUnavailable } from "@/lib/store/features";
import { formatShopCurrency } from "@/lib/shop/format";
import { storefrontUrl } from "@/lib/store/subdomain";

/** GET /api/store/abandoned-carts?slug= — checkouts shoppers didn't finish, for the shop to follow up by hand. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service } = resolved;
  const blocked = await featureUnavailable(access.tenantId, "abandonedCarts");
  if (blocked) return blocked;

  const [{ data: tenant }, { data: profile }] = await Promise.all([
    service.from("tenants").select("subdomain, name").eq("id", access.tenantId).maybeSingle(),
    service.schema("store").from("business_profile").select("country_code").eq("tenant_id", access.tenantId).maybeSingle(),
  ]);
  const shopUrl = storefrontUrl(String(tenant?.subdomain || tenant?.name || ""));
  const storeName = access.storeDisplayName;

  try {
    const carts = await listAbandonedCheckouts(access.tenantId);
    return NextResponse.json({
      abandonedAfterMinutes: ABANDONED_AFTER_MINUTES,
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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400 });

  await setCheckoutFollowUp(resolved.access.tenantId, parsed.data.id, parsed.data.followUp);
  return NextResponse.json({ ok: true });
}
