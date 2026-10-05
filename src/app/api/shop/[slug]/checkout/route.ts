import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { getStorePaymentRoute } from "@/lib/store/payments";
import { platformFeeSubunits } from "@/lib/store/billing";
import { deliveryFeeFor, mapDeliveryZone, type DeliveryZoneRow } from "@/lib/store/delivery";
import { mapOrderErrorMessage, resolveCartCurrency, toSubunitAmount } from "@/lib/shop/checkout";
import { initializeTransaction } from "@/lib/shop/paystack";
import { getStoreSlugFromHost } from "@/lib/store/subdomain";

const CheckoutSchema = z.object({
  customer: z.object({
    name: z.string().trim().min(1, "Please enter your name."),
    email: z.string().trim().email("Enter a valid email address."),
    phone: z.string().trim().optional(),
  }),
  shippingAddress: z
    .object({
      line1: z.string().trim().optional(),
      line2: z.string().trim().optional(),
      city: z.string().trim().optional(),
      state: z.string().trim().optional(),
      country: z.string().trim().optional(),
      postalCode: z.string().trim().optional(),
    })
    .default({}),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().nullable().optional(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1, "Your cart is empty."),
  /** One of the store's active delivery options; required when the store has any. */
  deliveryZoneId: z.string().uuid().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });

  const paymentRoute = await getStorePaymentRoute(tenant.id);
  if (!paymentRoute) {
    return NextResponse.json({ error: "This store isn't accepting payments yet." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid checkout details." }, { status: 400 });
  }

  const { customer, shippingAddress, items, deliveryZoneId } = parsed.data;
  const service = createServerSupabaseClient();

  // Delivery: the option must be one of this store's active ones, looked up
  // here rather than trusting any price from the browser.
  const { data: zoneRows } = await service
    .schema("store")
    .from("delivery_zones")
    .select("id, name, regions, fee, free_over, eta_text, is_pickup, is_active, sort_order")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true);
  const zones = ((zoneRows || []) as DeliveryZoneRow[]).map(mapDeliveryZone);
  const zone = zones.find((z) => z.id === deliveryZoneId) ?? null;
  if (zones.length > 0 && !zone) {
    return NextResponse.json({ error: "Please choose a delivery option." }, { status: 400 });
  }
  if (zone && !zone.isPickup && (!shippingAddress.line1 || !shippingAddress.city)) {
    return NextResponse.json({ error: "Please enter your delivery address." }, { status: 400 });
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

  const productIds = [...new Set(items.map((i) => i.productId))];
  const { data: currencyRows, error: currencyError } = await service
    .schema("store")
    .from("products")
    .select("id, currency")
    .eq("tenant_id", tenant.id)
    .in("id", productIds);

  if (currencyError) {
    return NextResponse.json({ error: "We couldn't process your order. Please try again." }, { status: 400 });
  }

  let currency: string;
  try {
    currency = resolveCartCurrency((currencyRows || []).map((r) => r.currency));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Currency mismatch." }, { status: 400 });
  }

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
  const subtotal = Number(created.total_amount);
  const deliveryFee = zone ? deliveryFeeFor(zone, subtotal) : 0;
  const order = { id: created.id, total_amount: Math.round((subtotal + deliveryFee) * 100) / 100 };

  if (zone) {
    const { error: deliveryError } = await service
      .schema("store")
      .from("orders")
      .update({ delivery_fee: deliveryFee, delivery_method: zone.name, total_amount: order.total_amount })
      .eq("id", order.id);
    if (deliveryError) {
      return NextResponse.json({ error: "We couldn't add delivery to your order. Please try again." }, { status: 500 });
    }
  }

  const origin = new URL(req.url).origin;
  const reference = order.id;
  // Send the shopper back to wherever they checked out: the store's own
  // subdomain, or /shop/<slug> on the platform domain.
  const onStoreSubdomain = getStoreSlugFromHost(req.headers.get("host")) === slug;
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
    });

    if (intentError) throw new Error(intentError.message);

    return NextResponse.json({
      authorizationUrl: transaction.authorizationUrl,
      reference,
      orderId: order.id,
    });
  } catch (err) {
    // The order + stock reservation was already created; if Paystack
    // initialization fails the reservation simply expires and is reclaimed
    // like any other abandoned checkout (see create_guest_order) -- no
    // separate rollback path needed.
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start payment. Please try again." },
      { status: 502 },
    );
  }
}
