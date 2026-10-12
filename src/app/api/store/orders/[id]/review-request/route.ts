import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { sendReviewRequest } from "@/lib/store/reviews-server";

/**
 * POST /api/store/orders/<id>/review-request { slug } — asks the customer for
 * a review, for a delivered order that hasn't been asked yet (for example one
 * delivered before reviews were switched on). Each order is only ever asked once.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const tenantId = resolved.access.tenantId;
  const { data: order, error } = await resolved.service
    .schema("store")
    .from("orders")
    .select("status, customer_email, review_requested_at")
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .maybeSingle();
  if (error?.code === "42703") return NextResponse.json({ error: "Customer reviews aren't switched on for your shop yet." }, { status: 503 });
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "Delivered") return NextResponse.json({ error: "You can ask for a review once the order has been delivered." }, { status: 409 });
  if (!order.customer_email) return NextResponse.json({ error: "This order has no email address to send the request to." }, { status: 409 });
  if (order.review_requested_at) return NextResponse.json({ error: "This customer has already been asked for a review." }, { status: 409 });
  await sendReviewRequest(tenantId, id);
  return NextResponse.json({ ok: true });
}
