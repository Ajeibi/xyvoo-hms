import { after, NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { recordMarketingConsent } from "@/lib/store/campaigns-server";
import { referralCodeCheck } from "@/lib/store/referrals-server";
import { tradeUnitPrice } from "@/lib/store/wholesale";
import { activeTrade, tradePricing } from "@/lib/store/wholesale-server";
import { getStorePaymentRoute } from "@/lib/store/payments";
import { platformFeeSubunits } from "@/lib/store/billing";
import { fitsWeight, mapDeliveryZone, orderWeightKg, zoneCovers, type DeliveryZoneRow } from "@/lib/store/delivery";
import { allocateDiscount, computeTax, lineTaxRate } from "@/lib/store/tax";
import { getTaxSettings } from "@/lib/store/tax-server";
import { deliveryWithRules } from "@/lib/store/free-delivery";
import { getCheckoutFreeRules } from "@/lib/store/free-delivery-server";
import { mapOrderErrorMessage, toSubunitAmount } from "@/lib/shop/checkout";
import { storeCurrency } from "@/lib/store/payout-routes";
import { initializeTransaction } from "@/lib/shop/paystack";
import { simulatedPaymentsEnabled } from "@/lib/payments/simulated";
import { getStoreSlugFromHost } from "@/lib/store/subdomain";
import { linkCheckoutToOrder } from "@/lib/store/checkouts";
import { accountForCheckout, getCustomerSession, startCustomerSession } from "@/lib/store/customer-accounts";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { availablePaymentMethods, OFFLINE_METHODS, parseOfflinePayments, PAYMENT_METHOD_LABELS } from "@/lib/store/offline-payments";
import { sendOrderPaidEmails, sendOrderReceivedEmails } from "@/lib/store/order-emails";
import { isShopLive } from "@/lib/store/site/data";
import { checkDiscount } from "@/lib/store/discounts";
import { discountProductIds, findDiscountByCode } from "@/lib/store/discounts-server";
import { formatShopCurrency } from "@/lib/shop/format";
import { GIFT_CARD_PROBLEMS, giftCardPurchaseSchema } from "@/lib/store/gift-cards";

/** Generous limits that no real order reaches, so junk can't fill the database. */
const text = (max: number) => z.string().trim().max(max, "That's longer than we can take. Please shorten it.");

const CheckoutSchema = z.object({
  customer: z.object({
    name: text(120).min(1, "Please enter your name."),
    email: text(254).email("Enter a valid email address."),
    phone: text(30).optional(),
  }),
  shippingAddress: z
    .object({
      line1: text(200).optional(),
      line2: text(200).optional(),
      city: text(100).optional(),
      state: text(100).optional(),
      country: text(2).optional(),
      postalCode: text(20).optional(),
    })
    .default({}),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().nullable().optional(),
        quantity: z.number().int().positive().max(999, "That's more than we can take in one order. Please contact the shop."),
      }),
    )
    .min(1, "Your cart is empty.")
    .max(50, "That's more items than we can take in one order. Please split it."),
  /** One of the store's active delivery options; required when the store has any. */
  deliveryZoneId: z.string().uuid().nullable().optional(),
  /** The checkout saved while the shopper typed (abandoned-cart follow-up), if any. Also stops a double click making two orders. */
  checkoutToken: text(100).optional(),
  /** Card (Paystack) or one of the shop's offline options. */
  paymentMethod: z.enum(["card", ...OFFLINE_METHODS]).default("card"),
  /** A discount code the shopper applied; worked out again here from the order's own lines. */
  discountCode: text(40).optional(),
  /** A gift card to pay with: as much of the total as its balance covers. */
  giftCardCode: text(40).optional(),
  /** Buying a gift card: who it's for. The basket is then just the gift card, with no delivery. */
  giftCard: giftCardPurchaseSchema.optional(),
  /** Ticked the box to hear from the shop by email. Never ticked for them. */
  marketingConsent: z.boolean().optional(),
  /** Loyalty points the signed-in shopper wants to use; checked and worked out again here. */
  loyaltyPoints: z.number().int().min(0).max(1_000_000).optional(),
});

const DISCOUNT_CLAIM_ERRORS: Record<string, string> = {
  inactive: "That discount code is no longer valid. Remove it to continue.",
  used_up: "Sorry, that discount code has just been used up. Remove it to continue.",
  customer_limit: "You've already used that discount code. Remove it to continue.",
};

const tooMany = (retryAfterSeconds: number) =>
  NextResponse.json({ error: "Too many checkout attempts. Please wait a few minutes and try again." }, { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } });

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]{1,63}$/i.test(slug)) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });

  // Each attempt reserves stock and creates a payment, so keep repeated attempts in check:
  // per shop, and a looser cap across shops so a shared mobile network isn't blocked by one shop's traffic.
  const ip = clientIp(req);
  const overall = await rateLimitShared(`checkout:${ip}`, 30, 10 * 60_000);
  if (!overall.ok) return tooMany(overall.retryAfterSeconds);
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });
  // A shop that hasn't been published (or is paused) doesn't take orders.
  if (!(await isShopLive(tenant.id))) return NextResponse.json({ error: "This shop isn't taking orders right now." }, { status: 403 });
  const perShop = await rateLimitShared(`checkout:${tenant.id}:${ip}`, 10, 10 * 60_000);
  if (!perShop.ok) return tooMany(perShop.retryAfterSeconds);

  const body = await req.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid checkout details." }, { status: 400 });
  }

  const { customer, shippingAddress, items, deliveryZoneId, checkoutToken, paymentMethod, discountCode, giftCardCode, giftCard, marketingConsent, loyaltyPoints } = parsed.data;
  const service = createServerSupabaseClient();
  const onStoreSubdomain = getStoreSlugFromHost(req.headers.get("host")) === slug;
  const receivedUrl = (orderId: string) => `${onStoreSubdomain ? "" : `/shop/${slug}`}/checkout/received?order=${orderId}`;

  // A double click, or a retry after a dropped connection: hand back the order
  // this checkout already made instead of reserving the stock twice.
  if (checkoutToken) {
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { data: previous } = await service
      .schema("store")
      .from("orders")
      .select("id, payment_method, payment_status, status, payment_intents(metadata)")
      .eq("tenant_id", tenant.id)
      .eq("checkout_token", checkoutToken)
      .gte("created_at", since)
      .neq("status", "Cancelled")
      .neq("payment_status", "failed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previous) {
      const intents = (previous.payment_intents as { metadata: { authorization_url?: string } | null }[] | null) ?? [];
      const authorizationUrl = intents.find((i) => i.metadata?.authorization_url)?.metadata?.authorization_url;
      if (previous.payment_method !== "Card") return NextResponse.json({ orderId: previous.id, receivedUrl: receivedUrl(previous.id) });
      if (authorizationUrl && previous.payment_status === "unpaid") return NextResponse.json({ authorizationUrl, reference: previous.id, orderId: previous.id });
      if (previous.payment_status === "paid") return NextResponse.json({ error: "This order has already been paid. Check your email for the confirmation." }, { status: 409 });
    }
  }

  // The chosen way to pay must be one this shop offers right now.
  const [paymentRoute, { data: profile }] = await Promise.all([
    getStorePaymentRoute(tenant.id),
    service.schema("store").from("business_profile").select("*").eq("tenant_id", tenant.id).maybeSingle(),
  ]);
  const offline = parseOfflinePayments(profile?.offline_payments);
  const methods = availablePaymentMethods({ acceptsCard: paymentRoute !== null || simulatedPaymentsEnabled(), offline, whatsappNumber: (profile?.whatsapp as string | null) ?? null });
  if (!methods.includes(paymentMethod)) {
    return NextResponse.json({ error: methods.length ? "That way to pay isn't available. Please choose another." : "This store isn't taking orders online yet." }, { status: 400 });
  }

  // Gift cards are bought on their own (no delivery, discount or tax), and never paid for with another gift card.
  const giftProductId = (profile?.gift_card_product_id as string | null | undefined) ?? null;
  const buyingGiftCard = Boolean(giftCard);
  if (buyingGiftCard) {
    const line = items[0];
    if (!profile?.gift_cards_enabled || !giftProductId || items.length !== 1 || line.productId !== giftProductId || line.quantity !== 1 || !line.variantId) {
      return NextResponse.json({ error: "Gift cards can't be bought here right now. Please refresh the page and try again." }, { status: 400 });
    }
    if (discountCode || giftCardCode) {
      return NextResponse.json({ error: "Discount codes and gift cards can't be used to buy a gift card." }, { status: 400 });
    }
  } else if (giftProductId && items.some((i) => i.productId === giftProductId)) {
    return NextResponse.json({ error: "Gift cards are bought on their own page. Remove the gift card from your basket, then buy it from its page." }, { status: 400 });
  }

  // Delivery: the option must be one of this store's active ones, looked up
  // here rather than trusting any price from the browser.
  const { data: zoneRows } = await service
    .schema("store")
    .from("delivery_zones")
    .select("id, name, regions, fee, weight_bands, free_over, eta_text, is_pickup, is_active, sort_order")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true);
  const zones = ((zoneRows || []) as DeliveryZoneRow[]).map(mapDeliveryZone);
  const zone = buyingGiftCard ? null : (zones.find((z) => z.id === deliveryZoneId) ?? null);
  if (!buyingGiftCard && zones.length > 0 && !zone) {
    return NextResponse.json({ error: "Please choose a delivery option." }, { status: 400 });
  }
  if (zone && !zone.isPickup && (!shippingAddress.line1 || !shippingAddress.city)) {
    return NextResponse.json({ error: "Please enter your delivery address." }, { status: 400 });
  }
  // An option limited to certain states or towns must cover this address.
  if (zone && !zoneCovers(zone, shippingAddress)) {
    return NextResponse.json({ error: `${zone.name} doesn't deliver to that address. Please choose another delivery option.` }, { status: 400 });
  }

  // An option that charges by weight can only carry an order up to its heaviest band.
  const { data: weightRows } = await service
    .schema("store")
    .from("products")
    .select("id, weight_kg")
    .eq("tenant_id", tenant.id)
    .in("id", [...new Set(items.map((i) => i.productId))]);
  const weightFor = new Map((weightRows || []).map((r) => [r.id as string, Number(r.weight_kg) || 0]));
  if (zone && !fitsWeight(zone, orderWeightKg(items.map((i) => ({ weightKg: weightFor.get(i.productId), quantity: i.quantity }))))) {
    return NextResponse.json({ error: `This order is too heavy for ${zone.name}. Please choose another delivery option, or contact the shop to arrange it.` }, { status: 400 });
  }

  // The discount code must exist before any stock is reserved.
  const discount = discountCode ? await findDiscountByCode(tenant.id, discountCode) : null;
  if (discountCode && !discount) {
    return NextResponse.json({ error: "That discount code isn't valid. Remove it or check the spelling." }, { status: 400 });
  }

  // A confirmed customer with an approved trade account pays trade prices, worked out here
  // from the shop's own prices. They must order with their account's email, and a discount
  // code doesn't stack on trade prices unless the shop allows it.
  const tradeSettings = buyingGiftCard ? null : await activeTrade(tenant.id, await getCustomerSession(tenant.id));
  if (tradeSettings) {
    const tradeSession = await getCustomerSession(tenant.id);
    if (tradeSession && tradeSession.account.email !== customer.email.trim().toLowerCase()) {
      return NextResponse.json({ error: "To get your trade prices, please order with the email address on your account." }, { status: 400 });
    }
    if (discountCode && !tradeSettings.allowDiscounts) {
      return NextResponse.json({ error: "Discount codes can't be used with trade prices. Remove the code to continue." }, { status: 400 });
    }
  }

  // A friend code is for a first order, and not for the customer who shared it.
  if (discount?.referralAccountId) {
    const problem = await referralCodeCheck(tenant.id, discount.referralAccountId, customer.email);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // Merge duplicate lines for the same product+variant before they reach
  // the RPC, which expects one line per product+variant.
  const mergedItems = new Map<string, { product_id: string; variant_id: string | null; quantity: number }>();
  for (const item of items) {
    const key = `${item.productId}:${item.variantId || ""}`;
    const existing = mergedItems.get(key);
    if (existing) existing.quantity += item.quantity;
    else mergedItems.set(key, { product_id: item.productId, variant_id: item.variantId || null, quantity: item.quantity });
  }

  // Prices are in the shop's home currency, whatever currency the shopper was
  // viewing, and that's what Paystack charges (and what the payout account settles in).
  const currency = await storeCurrency(tenant.id, service);

  const { data: orderResult, error: orderError } = await service
    .schema("store")
    .rpc("create_guest_order", {
      p_tenant_id: tenant.id,
      p_customer: customer,
      p_shipping_address: shippingAddress,
      p_items: [...mergedItems.values()],
    })
    .single();

  if (orderError || !orderResult) {
    return NextResponse.json({ error: mapOrderErrorMessage(orderError?.message || "") }, { status: 400 });
  }

  const created = orderResult as { id: string; total_amount: number };
  let itemsTotal = Number(created.total_amount);

  const { data: lineData } = await service.schema("store").from("order_items").select("id, product_id, quantity, cost_price, unit_price, line_total").eq("order_id", created.id);
  let lineRows = lineData;

  // Trade prices: each line at its trade price where the quantity qualifies; the rest stay at the normal price.
  let tradeApplied = false;
  if (tradeSettings && lineRows?.length) {
    const pricing = await tradePricing(tenant.id, lineRows.map((l) => l.product_id as string));
    const repriced = [] as { id: string; unit: number; total: number }[];
    lineRows = lineRows.map((l) => {
      const p = pricing.get(l.product_id as string);
      const unit = tradeUnitPrice({ unit: Number(l.unit_price), productPrice: p?.productPrice ?? 0, wholesalePrice: p?.wholesalePrice ?? null, minQty: p?.minQty ?? 1, quantity: Number(l.quantity) });
      if (unit >= Number(l.unit_price)) return l;
      const total = Math.round(unit * Number(l.quantity) * 100) / 100;
      repriced.push({ id: l.id as string, unit, total });
      return { ...l, unit_price: unit, line_total: total };
    });
    if (repriced.length) {
      for (const r of repriced) await service.schema("store").from("order_items").update({ unit_price: r.unit, line_total: r.total }).eq("id", r.id);
      itemsTotal = Math.round(lineRows.reduce((sum, l) => sum + Number(l.line_total), 0) * 100) / 100;
      tradeApplied = true;
      if (itemsTotal < tradeSettings.minOrder) {
        await service.schema("store").rpc("cancel_order", { p_tenant_id: tenant.id, p_order_id: created.id });
        return NextResponse.json({ error: `A trade order needs to come to at least ${formatShopCurrency(tradeSettings.minOrder, currency)} in items. Add a little more to your basket.` }, { status: 400 });
      }
    }
  }

  const orderLines = (lineRows || []).map((l) => ({ productId: l.product_id as string, lineTotal: Number(l.line_total) }));

  // The discount, from the order's own prices. Claiming it locks the code, so its
  // last use can't go to two shoppers; if the claim fails the order is undone.
  let discountAmount = 0;
  let discountEligible: string[] | null = null;
  let freeDeliveryCode = false;
  if (discount) {
    discountEligible = await discountProductIds(discount);
    const check = checkDiscount(discount, orderLines, discountEligible, new Date(), (amount) => formatShopCurrency(amount, currency));
    const claim = check.ok
      ? await service.schema("store").rpc("claim_discount", { p_tenant_id: tenant.id, p_order_id: created.id, p_code_id: discount.id, p_amount: check.amount })
      : null;
    if (!check.ok || claim?.error || claim?.data !== "ok") {
      await service.schema("store").rpc("cancel_order", { p_tenant_id: tenant.id, p_order_id: created.id });
      if (claim?.error) console.error("[checkout] discount claim failed", { orderId: created.id, error: claim.error });
      const message = !check.ok ? check.message : DISCOUNT_CLAIM_ERRORS[String(claim?.data)] ?? "We couldn't apply that discount code. Please try again.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    discountAmount = check.amount;
    freeDeliveryCode = check.freeDelivery;
  }
  // What the items come to after the discount; free delivery thresholds use this too.
  const subtotal = Math.round((itemsTotal - discountAmount) * 100) / 100;

  // Each product's extra delivery charge per item and how it's taxed, from the database rather than the browser.
  const [{ data: productRows }, tax] = await Promise.all([
    service
      .schema("store")
      .from("products")
      .select("id, delivery_extra, taxable, tax_class")
      .eq("tenant_id", tenant.id)
      .in("id", [...new Set(items.map((i) => i.productId))]),
    getTaxSettings(tenant.id).then((t) => (buyingGiftCard ? { ...t, enabled: false } : t)),
  ]);
  const productInfo = new Map((productRows || []).map((r) => [r.id as string, r]));

  let deliveryFee = 0;
  let deliveryMethod = zone?.name ?? null;
  if (zone && freeDeliveryCode && discount) {
    // A free delivery code waives the whole delivery charge.
    if (!zone.isPickup) deliveryMethod = `${zone.name} (free with code ${discount.code})`;
  } else if (zone) {
    const extraFor = new Map((productRows || []).map((r) => [r.id as string, Number(r.delivery_extra) || 0]));
    const delivery = deliveryWithRules(
      zone,
      {
        state: shippingAddress.state ?? "",
        city: shippingAddress.city ?? "",
        subtotal,
        lines: [...mergedItems.values()].map((i) => ({ productId: i.product_id, quantity: i.quantity, deliveryExtra: extraFor.get(i.product_id), weightKg: weightFor.get(i.product_id) })),
      },
      await getCheckoutFreeRules(tenant.id),
    );
    deliveryFee = delivery.fee;
    // Shown on the order, so the shop can see why delivery was free.
    if (delivery.rule) deliveryMethod = `${zone.name} (${delivery.rule.name})`;
  }

  // Tax, line by line after the discount. Included in the prices: worked out for
  // the receipt only. Added at checkout: on top of the total.
  const discountShares = allocateDiscount(orderLines, discountEligible, discountAmount);
  const taxResult = computeTax(
    tax,
    orderLines.map((l, i) => {
      const info = productInfo.get(l.productId);
      return { lineTotal: l.lineTotal, discount: discountShares[i], rate: lineTaxRate(tax, { taxable: info?.taxable as boolean | null, taxClass: info?.tax_class as string | null }) };
    }),
    deliveryFee,
  );
  const addedTax = taxResult.inclusive ? 0 : taxResult.amount;

  // Profit for the dashboard: what the items sold for, less what they cost the shop, any discount, and tax that was in the prices.
  const profit = buyingGiftCard
    ? 0
    : Math.round(
      ((lineRows || []).reduce((sum, l) => sum + Number(l.line_total) - Number(l.cost_price || 0) * Number(l.quantity), 0) -
        discountAmount -
        (taxResult.inclusive ? taxResult.itemsTax : 0)) *
        100,
    ) / 100;
  const order = { id: created.id, total_amount: Math.round((subtotal + deliveryFee + addedTax) * 100) / 100 };

  // A gift card pays as much of the total as its balance covers. The card is
  // locked while it's charged, and the money goes back on it automatically if
  // this order is cancelled or never paid (see the gift cards migration).
  let giftCardAmount = 0;
  if (giftCardCode) {
    const { data: redeemed, error: redeemError } = await service
      .schema("store")
      .rpc("redeem_gift_card", { p_tenant_id: tenant.id, p_order_id: order.id, p_code: giftCardCode, p_max: order.total_amount });
    const result = redeemed as { status: string; amount?: number } | null;
    if (redeemError || result?.status !== "ok") {
      await service.schema("store").rpc("cancel_order", { p_tenant_id: tenant.id, p_order_id: order.id });
      if (redeemError) console.error("[checkout] gift card not applied", { orderId: order.id, error: redeemError });
      return NextResponse.json({ error: GIFT_CARD_PROBLEMS[String(result?.status)] ?? "We couldn't use that gift card. Please try again." }, { status: 409 });
    }
    giftCardAmount = Number(result.amount) || 0;
    order.total_amount = Math.round((order.total_amount - giftCardAmount) * 100) / 100;
  }

  // Loyalty points come off what is left. Only a shopper who has confirmed their
  // email with a code can spend points, and only on an order with that email.
  if (loyaltyPoints && loyaltyPoints > 0 && !buyingGiftCard) {
    const session = await getCustomerSession(tenant.id);
    const problem =
      !session?.verified || session.account.email !== customer.email.trim().toLowerCase()
        ? "To use your points, sign in with the code we email you, and order with the email address on your account."
        : null;
    let redeemFailed = problem;
    let result = null as { status: string; points?: number; amount?: number; minimum?: number } | null;
    if (!problem && session) {
      const { data: redeemed, error: redeemError } = await service
        .schema("store")
        .rpc("redeem_loyalty_points", { p_tenant_id: tenant.id, p_order_id: order.id, p_account_id: session.account.id, p_points: loyaltyPoints, p_max: order.total_amount });
      result = redeemed as typeof result;
      if (redeemError) console.error("[checkout] points not applied", { orderId: order.id, error: redeemError });
      if (redeemError || result?.status !== "ok") {
        redeemFailed =
          result?.status === "below_minimum"
            ? `You need to use at least ${result.minimum} points at once.`
            : result?.status === "no_points"
              ? "You don't have any points to use on this order."
              : "We couldn't use your points. Please try again, or untick “Use my points”.";
      }
    }
    if (redeemFailed || !result) {
      await service.schema("store").rpc("cancel_order", { p_tenant_id: tenant.id, p_order_id: order.id });
      return NextResponse.json({ error: redeemFailed || "We couldn't use your points. Please try again." }, { status: 409 });
    }
    order.total_amount = Math.round((order.total_amount - (Number(result.amount) || 0)) * 100) / 100;
  }

  const { error: totalsError } = await service
    .schema("store")
    .from("orders")
    .update({
      ...(zone ? { delivery_fee: deliveryFee, delivery_method: deliveryMethod } : {}),
      total_amount: order.total_amount,
      profit,
      ...(giftCardAmount > 0 ? { gift_card_amount: giftCardAmount } : {}),
      ...(tradeApplied ? { trade_order: true } : {}),
      ...(giftCard ? { gift_card_purchase: giftCard, delivery_method: "Sent by email" } : {}),
    })
    .eq("id", order.id);
  if (totalsError) {
    return NextResponse.json({ error: "We couldn't finish your order. Please try again." }, { status: 500 });
  }
  // Only shops that charge tax write the tax columns, so orders still go through before they exist.
  if (tax.enabled) {
    const { error: taxError } = await service
      .schema("store")
      .from("orders")
      .update({ tax_amount: taxResult.amount, tax_inclusive: taxResult.inclusive, tax_rate: taxResult.rate })
      .eq("id", order.id)
      .eq("tenant_id", tenant.id);
    if (taxError) {
      console.error("[checkout] tax not recorded", { orderId: order.id, error: taxError });
      await service.schema("store").rpc("cancel_order", { p_tenant_id: tenant.id, p_order_id: order.id });
      return NextResponse.json({ error: "We couldn't finish your order. Please try again." }, { status: 500 });
    }
    // The VAT name and number in force today, for this order's receipt. A separate
    // write, so orders still go through before these columns exist.
    if (tax.number || tax.name) {
      await service.schema("store").from("orders").update({ tax_name: tax.name || null, tax_number: tax.number || null }).eq("id", order.id).eq("tenant_id", tenant.id);
    }
  }
  // Separate write: if the column isn't there yet, the order still goes through.
  if (checkoutToken) await service.schema("store").from("orders").update({ checkout_token: checkoutToken }).eq("id", order.id);

  if (checkoutToken) await linkCheckoutToOrder(tenant.id, checkoutToken, order.id).catch(() => undefined);

  // Every buyer gets an account, made from the details they've just typed (no
  // extra step). A new account signs this device in; an existing one is only
  // linked to the order, and its owner signs in with an emailed code as usual.
  const accountCookie = await linkOrderToAccount(tenant.id, order.id, customer, checkoutToken).catch((err) => {
    console.error("[checkout] account not linked", { orderId: order.id, err });
    return null;
  });
  if (marketingConsent) await recordMarketingConsent(tenant.id, customer.email, customer.name, "checkout");
  const json = (body: Record<string, unknown>) => {
    const res = NextResponse.json(body);
    if (accountCookie) res.cookies.set(accountCookie.name, accountCookie.value, accountCookie.options);
    return res;
  };

  if (order.total_amount <= 0) {
    // Fully covered by a discount or gift card: nothing to collect, so it's paid now.
    const { error: freeError } = await service.schema("store").rpc("mark_order_paid", { p_order_id: order.id, p_paystack_reference: `discount-${order.id}` });
    if (freeError) return NextResponse.json({ error: "We couldn't place your order. Please try again." }, { status: 500 });
    await service
      .schema("store")
      .from("orders")
      .update({ payment_method: giftCardAmount > 0 ? "Gift card" : "Discount", emails_sent_at: new Date().toISOString() })
      .eq("id", order.id);
    after(() => sendOrderPaidEmails(tenant.id, order.id));
    return json({ orderId: order.id, receivedUrl: receivedUrl(order.id) });
  }

  if (paymentMethod !== "card") {
    // Offline orders don't expire: the shop confirms the payment, or cancels the order, from the dashboard.
    const { error: offlineError } = await service
      .schema("store")
      .from("orders")
      .update({ payment_method: PAYMENT_METHOD_LABELS[paymentMethod], expires_at: null })
      .eq("id", order.id);
    if (offlineError) return NextResponse.json({ error: "We couldn't place your order. Please try again." }, { status: 500 });
    after(() => sendOrderReceivedEmails(tenant.id, order.id));
    return json({ orderId: order.id, receivedUrl: receivedUrl(order.id) });
  }
  const simulated = simulatedPaymentsEnabled();
  if (!paymentRoute && !simulated) return NextResponse.json({ error: "Card payments aren't available. Please choose another way to pay." }, { status: 400 });

  const origin = new URL(req.url).origin;
  const reference = order.id;

  // Testing only: a pretend card page instead of Paystack. No money moves and nothing leaves this app.
  if (simulated) {
    const authorizationUrl = `${origin}${onStoreSubdomain ? "" : `/shop/${slug}`}/checkout/simulate?reference=${reference}`;
    const { error: intentError } = await service.schema("store").from("payment_intents").insert({
      tenant_id: tenant.id,
      order_id: order.id,
      amount: order.total_amount,
      currency_code: currency,
      paystack_reference: reference,
      status: "pending",
      metadata: { authorization_url: authorizationUrl, simulated: true },
    });
    if (intentError) {
      console.error("[checkout] simulated payment not started", { orderId: order.id, error: intentError.message });
      return NextResponse.json({ error: "We couldn't start the payment just now. Please try again in a moment." }, { status: 502 });
    }
    return json({ authorizationUrl, reference, orderId: order.id });
  }
  if (!paymentRoute) return NextResponse.json({ error: "Card payments aren't available. Please choose another way to pay." }, { status: 400 });
  // Send the shopper back to wherever they checked out: the store's own
  // subdomain, or /shop/<slug> on the platform domain.
  const callbackUrl = onStoreSubdomain ? `${origin}/checkout/callback` : `${origin}/shop/${slug}/checkout/callback`;

  const amountSubunit = toSubunitAmount(Number(order.total_amount));
  const split = paymentRoute.kind === "split";
  const feeSubunits = split ? platformFeeSubunits(amountSubunit, paymentRoute.feeRate) : 0;

  try {
    // Record XYVOO's share on the order (zero for stores still on their own keys,
    // where nothing is collected).
    const { error: feeError } = await service
      .schema("store")
      .from("orders")
      .update({ platform_fee: feeSubunits / 100, platform_fee_percentage: split ? paymentRoute.feeRate : null })
      .eq("id", order.id);
    if (feeError) throw new Error(feeError.message);

    const transaction = await initializeTransaction({
      secretKey: paymentRoute.secretKey,
      email: customer.email,
      amountSubunit,
      currency,
      reference,
      callbackUrl,
      metadata: { tenant_id: tenant.id, order_id: order.id },
      split: split
        ? { subaccount: paymentRoute.subaccountCode, transactionChargeSubunits: feeSubunits, bearer: paymentRoute.bearer }
        : undefined,
    });

    const { error: intentError } = await service.schema("store").from("payment_intents").insert({
      tenant_id: tenant.id,
      order_id: order.id,
      amount: order.total_amount,
      currency_code: currency,
      paystack_reference: reference,
      status: "pending",
      subaccount_code: split ? paymentRoute.subaccountCode : null,
      // Kept so a repeated submit can send the shopper back to the same payment page.
      metadata: { authorization_url: transaction.authorizationUrl },
    });

    if (intentError) throw new Error(intentError.message);

    return json({
      authorizationUrl: transaction.authorizationUrl,
      reference,
      orderId: order.id,
    });
  } catch (err) {
    // The order + stock reservation was already created; if Paystack
    // initialization fails the reservation simply expires and is reclaimed
    // like any other abandoned checkout (see create_guest_order) -- no
    // separate rollback path needed.
    console.error("[checkout] payment not started", { orderId: order.id, err });
    return NextResponse.json({ error: "We couldn't start the payment just now. Please try again in a moment." }, { status: 502 });
  }
}

/**
 * Links the order (and its saved checkout) to the buyer's account, creating the
 * account if it's their first order. Returns the cookie to sign this device in
 * when the account is new and nobody is signed in here yet.
 */
async function linkOrderToAccount(tenantId: string, orderId: string, customer: { name: string; email: string; phone?: string }, checkoutToken: string | undefined) {
  const session = await getCustomerSession(tenantId);
  const sameShopper = session && session.account.email === customer.email.trim().toLowerCase();
  const owner = sameShopper ? { account: session.account, created: false } : await accountForCheckout(tenantId, customer);
  if (!owner) return null;
  const db = createServerSupabaseClient().schema("store");
  await db.from("orders").update({ customer_account_id: owner.account.id }).eq("id", orderId).eq("tenant_id", tenantId);
  if (checkoutToken) await db.from("checkouts").update({ customer_account_id: owner.account.id }).eq("tenant_id", tenantId).eq("token", checkoutToken);
  return owner.created && !session ? startCustomerSession(tenantId, owner.account.id, false) : null;
}
