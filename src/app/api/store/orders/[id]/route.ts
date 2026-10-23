import { after, NextResponse } from "next/server";
import { sendGiftCardsForShop } from "@/lib/store/gift-cards";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { applyOrderAction, OrderActionError, orderActionSchema } from "@/lib/store/order-actions";
import { emailForAction, sendOrderStatusEmail } from "@/lib/store/order-status-emails";
import { sendReceiptEmail } from "@/lib/store/receipts";
import { sendReviewRequest } from "@/lib/store/reviews-server";
import { whatsappOrderUpdate } from "@/lib/store/whatsapp-messages";

/** PATCH /api/store/orders/<id> { slug, action } — confirm payment, ship, deliver or cancel an order. Any team member. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const parsed = orderActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose what to do with the order." }, { status: 400 });

  const { tenantId, userId, currentUserName } = resolved.access;
  try {
    await applyOrderAction(tenantId, id, parsed.data.action, { userId, name: currentUserName });
  } catch (error) {
    if (error instanceof OrderActionError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[order action] failed", error);
    return NextResponse.json({ error: "We couldn't update the order. Please try again." }, { status: 500 });
  }

  const email = emailForAction(parsed.data.action);
  if (email) after(() => sendOrderStatusEmail(tenantId, id, email));
  // The shop confirmed an offline payment: the shopper gets their numbered receipt.
  if (parsed.data.action === "payment_received") {
    after(() => sendReceiptEmail(tenantId, id));
    after(() => whatsappOrderUpdate(tenantId, id, "payment_received"));
    // A paid gift card order: the database has made the card, so email it now.
    after(() => sendGiftCardsForShop(tenantId));
  }
  // Delivered: the shopper is asked to review what they bought (once per order).
  if (parsed.data.action === "delivered") after(() => sendReviewRequest(tenantId, id));
  return NextResponse.json({ ok: true });
}
