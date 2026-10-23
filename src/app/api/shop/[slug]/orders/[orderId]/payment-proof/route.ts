import { after, NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { MAX_PROOF_BYTES, savePaymentProof, sendPaymentProofAlert, sniffProofType } from "@/lib/store/payment-proof";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Proof can be sent for this long after ordering. */
const WINDOW_DAYS = 14;

/**
 * POST /api/shop/<store>/orders/<orderId>/payment-proof (form data: file) —
 * the shopper's screenshot or PDF of their bank transfer. Only for a recent,
 * unpaid bank transfer order, by its unguessable id (as on the "order
 * received" page). JPEG, PNG, WebP or PDF up to 5MB, checked by content.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; orderId: string }> }) {
  const { slug, orderId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const tenant = /^[a-z0-9-]{1,63}$/i.test(slug) ? await getShopTenantBySlug(slug) : null;
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const limit = await rateLimitShared(`payment-proof:${orderId}:${clientIp(req)}`, 10, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "You've sent a lot of files. Please wait a little and try again." }, { status: 429 });

  const { data: order } = await createServerSupabaseClient()
    .schema("store")
    .from("orders")
    .select("id, payment_method, payment_status, status, created_at")
    .eq("tenant_id", tenant.id)
    .eq("id", orderId)
    .maybeSingle();
  const recent = order && Date.now() - new Date(order.created_at as string).getTime() < WINDOW_DAYS * 86_400_000;
  if (!order || !recent || order.payment_method !== "Bank Transfer") return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status === "Cancelled") return NextResponse.json({ error: "This order has been cancelled. Please contact the shop." }, { status: 409 });
  if (order.payment_status !== "unpaid") return NextResponse.json({ error: "The shop has already marked this order as paid." }, { status: 409 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a screenshot or PDF of your transfer." }, { status: 400 });
  if (file.size > MAX_PROOF_BYTES) return NextResponse.json({ error: "That file is too large. Please choose one under 5MB." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffProofType(bytes);
  if (!type) return NextResponse.json({ error: "Please choose a JPEG, PNG or WebP picture, or a PDF." }, { status: 400 });

  const problem = await savePaymentProof(tenant.id, orderId, bytes, type);
  if (problem) return NextResponse.json({ error: problem }, { status: 500 });
  after(() => sendPaymentProofAlert(tenant.id, orderId));
  return NextResponse.json({ ok: true }, { status: 201 });
}
