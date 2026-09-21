import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getShopTenantBySlug, getTenantPaystackSetup } from "@/lib/shop/tenants";
import { mapOrderErrorMessage, resolveCartCurrency, toSubunitAmount } from "@/lib/shop/checkout";
import { initializeTransaction } from "@/lib/shop/paystack";

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
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Storefront not found." }, { status: 404 });

  const paystack = await getTenantPaystackSetup(tenant.id);
  if (!paystack) {
    return NextResponse.json({ error: "This store isn't accepting payments yet." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid checkout details." }, { status: 400 });
  }

  const { customer, shippingAddress, items } = parsed.data;
  const service = createServerSupabaseClient();

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

  const order = orderResult as { id: string; total_amount: number };

  const origin = new URL(req.url).origin;
  const reference = order.id;

  try {
    const transaction = await initializeTransaction({
      secretKey: paystack.secretKey,
      email: customer.email,
      amountSubunit: toSubunitAmount(Number(order.total_amount)),
      currency,
      reference,
      callbackUrl: `${origin}/shop/${slug}/checkout/callback`,
      metadata: { tenant_id: tenant.id, order_id: order.id },
    });

    const { error: intentError } = await service.schema("store").from("payment_intents").insert({
      tenant_id: tenant.id,
      order_id: order.id,
      amount: order.total_amount,
      currency_code: currency,
      paystack_reference: reference,
      status: "pending",
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
