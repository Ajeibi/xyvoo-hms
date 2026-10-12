import { after, NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { sendOrderStatusEmail } from "@/lib/store/order-status-emails";
import { issueRefund, RefundError } from "@/lib/store/refunds-server";
import { rateLimitShared } from "@/lib/rate-limit";

const refundSchema = z.object({
  slug: z.string(),
  amount: z.number().positive().max(1_000_000_000),
  reason: z.string().trim().max(500).optional().default(""),
  restock: z
    .array(z.object({ itemId: z.string().regex(/^[0-9a-f-]{36}$/i), quantity: z.number().int().min(0).max(100_000) }))
    .max(200)
    .optional()
    .default([]),
});

/**
 * POST /api/store/orders/<id>/refund { slug, amount, reason, restock } —
 * a full or partial refund. Card payments go back through Paystack; other
 * payments are recorded as returned by the shop. Owner or admin only.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) {
    return NextResponse.json({ error: "Only the shop owner or an admin can give refunds." }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Enter how much to refund." }, { status: 400 });

  const { tenantId, userId, currentUserName } = resolved.access;
  const limit = await rateLimitShared(`store-refund:${tenantId}`, 20, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "That's a lot of refunds at once. Please wait a few minutes and try again." }, { status: 429 });

  try {
    const result = await issueRefund({
      tenantId,
      orderId: id,
      amount: parsed.data.amount,
      reason: parsed.data.reason || null,
      restock: parsed.data.restock.filter((r) => r.quantity > 0),
      actor: { userId, name: currentUserName },
    });
    after(() => sendOrderStatusEmail(tenantId, id, { refundId: result.refundId, amount: result.amount }));
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof RefundError) return NextResponse.json({ error: error.message }, { status: 409 });
    console.error("[refund] failed", { orderId: id, error });
    return NextResponse.json({ error: "We couldn't make the refund. Please try again." }, { status: 500 });
  }
}
