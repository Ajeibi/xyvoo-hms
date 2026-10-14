import { after, NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { sendReceiptEmail } from "@/lib/store/receipts";
import { MANUAL_CHANNELS, MANUAL_PAYMENT_METHODS } from "@/lib/store/manual-orders";

/*
 * POST /api/store/orders/manual — record a sale made in person, on the phone,
 * on WhatsApp or on social media. Stock comes off straight away, it counts in
 * sales figures and customers, and a paid order gets a numbered receipt
 * (emailed if the customer gave an email address and the shop asked us to).
 * Anyone on the team can record one.
 */

const money = z.number().min(0).max(100_000_000);

const BodySchema = z.object({
  slug: z.string(),
  channel: z.enum(MANUAL_CHANNELS),
  customer: z
    .object({
      name: z.string().trim().max(120).optional(),
      email: z.string().trim().toLowerCase().max(200).email("Check the customer's email address.").optional().or(z.literal("")),
      phone: z.string().trim().max(40).regex(/^[0-9+()\s-]*$/, "Check the customer's phone number.").optional(),
    })
    .default({}),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        variantId: z.string().uuid().nullable().optional(),
        quantity: z.number().int().min(1).max(999),
        unitPrice: money.optional(),
      }),
    )
    .min(1, "Add at least one product.")
    .max(50),
  paymentMethod: z.enum(MANUAL_PAYMENT_METHODS),
  /** Handed over there and then (in person), or still to be sent. */
  collected: z.boolean(),
  deliveryFee: money.default(0),
  deliveryMethod: z.string().trim().max(120).optional(),
  address: z.string().trim().max(400).optional(),
  discount: money.default(0),
  note: z.string().trim().max(1000).optional(),
  emailReceipt: z.boolean().default(false),
});

const ERRORS: Record<string, string> = {
  INSUFFICIENT_STOCK: "There isn't enough stock of",
  PRODUCT_NOT_FOUND: "One of the products can't be found. Please refresh the page and try again.",
  VARIANT_NOT_FOUND: "One of the sizes or colours can't be found. Please refresh the page and try again.",
  INVALID_PRICE: "Prices can't be below zero.",
};

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check the order." }, { status: 400 });
  const input = parsed.data;
  const { access, service } = resolved;
  const tenantId = access.tenantId;
  const db = service.schema("store");

  // Gift cards are only sold through the shop, so the card is made and emailed properly.
  const { data: profile } = await db.from("business_profile").select("gift_card_product_id").eq("tenant_id", tenantId).maybeSingle();
  if (profile?.gift_card_product_id && input.items.some((i) => i.productId === profile.gift_card_product_id)) {
    return NextResponse.json({ error: "Gift cards can't be added to an order recorded by hand. Use Gift cards → Send a gift card instead." }, { status: 400 });
  }

  const paid = input.paymentMethod !== "Pay later";
  const { data: order, error } = await db
    .rpc("create_manual_order", {
      p_tenant_id: tenantId,
      p_customer: { name: input.customer.name, email: input.customer.email || undefined, phone: input.customer.phone },
      p_items: input.items.map((i) => ({ product_id: i.productId, variant_id: i.variantId ?? null, quantity: i.quantity, unit_price: i.unitPrice ?? null })),
      p_details: {
        channel: input.channel,
        payment_method: input.paymentMethod,
        paid,
        collected: input.collected,
        delivery_fee: input.collected ? 0 : input.deliveryFee,
        delivery_method: input.collected ? "Collected" : input.deliveryMethod || "Delivery",
        discount: input.discount,
        note: input.note,
        shipping_address: !input.collected && input.address ? { line1: input.address } : {},
        recorded_by: access.userId,
      },
    })
    .single();

  if (error || !order) {
    const [code, detail] = (error?.message || "").split(":").map((s) => s.trim());
    const message = code === "INSUFFICIENT_STOCK" && detail ? `${ERRORS[code]} ${detail}.` : ERRORS[code] ?? "We couldn't record the order. Please try again.";
    if (!ERRORS[code]) console.error("[manual order] failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const created = order as { id: string; order_ref?: string };

  await logActivity({ tenantId, actor: access, area: "orders", action: "recorded", targetId: created.id, targetLabel: created.id.slice(0, 8).toUpperCase() });
  if (paid && input.emailReceipt && input.customer.email) after(() => sendReceiptEmail(tenantId, created.id));
  return NextResponse.json({ orderId: created.id }, { status: 201 });
}
