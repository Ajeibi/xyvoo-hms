import { after, NextResponse } from "next/server";
import { sendGiftCardsForShop } from "@/lib/store/gift-cards";
import { sendReviewRequest } from "@/lib/store/reviews-server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { applyOrderAction, ORDER_ACTIONS, OrderActionError } from "@/lib/store/order-actions";
import { emailForAction, sendOrderStatusEmail } from "@/lib/store/order-status-emails";
import { sendReceiptEmail } from "@/lib/store/receipts";

const bulkSchema = z.object({
  slug: z.string(),
  action: z.enum(ORDER_ACTIONS),
  ids: z.array(z.string().regex(/^[0-9a-f-]{36}$/i)).min(1).max(100),
});

/**
 * POST /api/store/orders/bulk { slug, action, ids } — the same action on
 * several orders, by the same rules as one order. Orders it can't apply to
 * are skipped and counted. Any team member.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;

  const parsed = bulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Choose up to 100 orders and what to do with them." }, { status: 400 });

  const { tenantId, userId, currentUserName } = resolved.access;
  const { action } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];
  const updated: string[] = [];
  let skipped = 0;
  let failed = 0;
  for (const id of ids) {
    try {
      await applyOrderAction(tenantId, id, action, { userId, name: currentUserName });
      updated.push(id);
    } catch (error) {
      if (error instanceof OrderActionError) skipped += 1;
      else {
        failed += 1;
        console.error("[bulk order action] failed", { id, error });
      }
    }
  }

  const email = emailForAction(action);
  if (email && updated.length) {
    after(async () => {
      for (const id of updated) await sendOrderStatusEmail(tenantId, id, email);
    });
  }
  // As for one order: a confirmed offline payment gets the shopper their receipt.
  if (action === "payment_received" && updated.length) {
    after(async () => {
      for (const id of updated) await sendReceiptEmail(tenantId, id);
      await sendGiftCardsForShop(tenantId);
    });
  }
  // Delivered: each shopper is asked to review what they bought.
  if (action === "delivered" && updated.length) {
    after(async () => {
      for (const id of updated) await sendReviewRequest(tenantId, id);
    });
  }
  return NextResponse.json({ updated: updated.length, skipped, failed });
}
