import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { paymentProofLink } from "@/lib/store/payment-proof";

/**
 * GET /api/store/orders/<id>/payment-proof?slug= — opens the proof of payment
 * a shopper sent for a bank transfer order, through a link that works for a
 * few minutes. Any team member.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const link = await paymentProofLink(resolved.access.tenantId, id);
  if (!link) return NextResponse.json({ error: "The customer hasn't sent proof of payment for this order." }, { status: 404 });
  return NextResponse.redirect(link, { headers: { "Cache-Control": "private, no-store" } });
}
