import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { countShopperAccounts, listShoppersNotBought } from "@/lib/store/customer-accounts-admin";
import { featureUnavailable } from "@/lib/store/features";
import { formatShopCurrency } from "@/lib/shop/format";
import { storefrontUrl } from "@/lib/store/subdomain";
import { whatsappLink } from "@/lib/store/whatsapp";

/**
 * GET /api/store/customers/accounts?slug= — shoppers who created an account
 * but haven't bought yet, with what they looked at and their basket. Ways to
 * contact them are only included when they agreed to be contacted.
 */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service } = resolved;
  const blocked = await featureUnavailable(access.tenantId, "customers");
  if (blocked) return blocked;

  try {
    const [shoppers, total, { data: tenant }, { data: profile }] = await Promise.all([
      listShoppersNotBought(access.tenantId),
      countShopperAccounts(access.tenantId),
      service.from("tenants").select("subdomain, name").eq("id", access.tenantId).maybeSingle(),
      service.schema("store").from("business_profile").select("country_code, currency_code").eq("tenant_id", access.tenantId).maybeSingle(),
    ]);
    const shopUrl = storefrontUrl(String(tenant?.subdomain || tenant?.name || ""));
    const storeName = access.storeDisplayName;
    const currency = profile?.currency_code || "NGN";

    return NextResponse.json({
      total,
      shoppers: shoppers.map((s) => {
        const first = s.name?.split(/\s+/)[0] || "there";
        const interest = s.basket.length ? s.basket.map((b) => b.name).join(", ") : s.viewed.map((v) => v.name).slice(0, 2).join(" and ");
        const message = interest
          ? `Hello ${first}, this is ${storeName}. Thanks for creating an account with us. We saw you were interested in ${interest}. Can we help with anything? ${shopUrl}`
          : `Hello ${first}, this is ${storeName}. Thanks for creating an account with us. Can we help you find anything? ${shopUrl}`;
        return {
          ...s,
          basketTotal: formatShopCurrency(s.basket.reduce((sum, b) => sum + b.unitPrice * b.quantity, 0), currency),
          whatsappHref: s.contactConsent ? whatsappLink(s.phone, message, profile?.country_code || "NG") : null,
          emailHref: s.contactConsent
            ? `mailto:${encodeURIComponent(s.email)}?subject=${encodeURIComponent(`Hello from ${storeName}`)}&body=${encodeURIComponent(message)}`
            : null,
        };
      }),
    });
  } catch (error) {
    console.error("[customer accounts] failed", error);
    return NextResponse.json({ error: "We couldn't load shopper accounts just now." }, { status: 500 });
  }
}
