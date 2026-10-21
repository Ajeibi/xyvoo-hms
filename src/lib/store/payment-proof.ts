import { randomUUID } from "node:crypto";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sniffImageType } from "./reviews";
import { orderReference } from "./order-emails";

/*
 * Proof of payment for a bank transfer order: a screenshot or PDF the shopper
 * uploads from the "order received" page. Kept in a private bucket and shown
 * to the shop through a signed link that expires, so nobody else can open it.
 */

export const PAYMENT_PROOF_BUCKET = "store-payment-proofs";
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
/** How long a shop's link to a proof works. */
const SIGNED_SECONDS = 10 * 60;

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** JPEG, PNG, WebP or PDF, judged by the file's own first bytes (not its name or what the browser says). */
export function sniffProofType(bytes: Uint8Array) {
  const image = sniffImageType(bytes);
  if (image) return image;
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-") return "application/pdf";
  return null;
}

/** Stores the file and records it on the order. Returns why it couldn't, or null. */
export async function savePaymentProof(tenantId: string, orderId: string, bytes: Uint8Array, type: string): Promise<string | null> {
  const db = createServerSupabaseClient();
  const path = `${tenantId}/${orderId}/${randomUUID()}.${EXTENSIONS[type]}`;
  let upload = await db.storage.from(PAYMENT_PROOF_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  // Before the migration has made the bucket: make it (private) and try once more.
  if (upload.error && /bucket/i.test(upload.error.message)) {
    await db.storage.createBucket(PAYMENT_PROOF_BUCKET, { public: false }).catch(() => undefined);
    upload = await db.storage.from(PAYMENT_PROOF_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  }
  if (upload.error) {
    console.error("[payment proof] not stored", { orderId, error: upload.error.message });
    return "We couldn't upload that just now. Please try again.";
  }
  const { error } = await db
    .schema("store")
    .from("orders")
    .update({ payment_proof_path: path, payment_proof_uploaded_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("tenant_id", tenantId);
  if (error) {
    console.error("[payment proof] not recorded", { orderId, error: error.message });
    return "We couldn't save that just now. Please try again.";
  }
  return null;
}

/** A link the shop can open for a few minutes. Null if the order has no proof. */
export async function paymentProofLink(tenantId: string, orderId: string) {
  const db = createServerSupabaseClient();
  const { data } = await db.schema("store").from("orders").select("payment_proof_path").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle();
  const path = data?.payment_proof_path as string | null | undefined;
  if (!path) return null;
  const { data: signed } = await db.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(path, SIGNED_SECONDS);
  return signed?.signedUrl ?? null;
}

/** Tells the shop a shopper has sent proof of their transfer, so they can check their account. Never throws. */
export async function sendPaymentProofAlert(tenantId: string, orderId: string) {
  try {
    const db = createServerSupabaseClient();
    const [{ data: order }, { data: profile }, { data: tenant }] = await Promise.all([
      db.schema("store").from("orders").select("customer_name, total_amount").eq("id", orderId).eq("tenant_id", tenantId).maybeSingle(),
      db.schema("store").from("business_profile").select("business_email").eq("tenant_id", tenantId).maybeSingle(),
      db.from("tenants").select("subdomain, name").eq("id", tenantId).maybeSingle(),
    ]);
    const to = profile?.business_email as string | null | undefined;
    if (!order || !to || !tenant) return;
    const reference = orderReference(orderId);
    const dashboard = `${EMAIL_SITE_URL}/storefront/${tenant.subdomain || tenant.name}/orders`;
    await sendBrandedEmail({
      to,
      subject: `Proof of payment sent for order ${reference}`,
      text: [`${order.customer_name} has sent proof of their bank transfer for order ${reference}.`, "Check your bank account, then mark the order as paid in your dashboard:", dashboard].join("\n"),
      layout: {
        preheader: `${order.customer_name} sent proof of payment for order ${reference}.`,
        badges: [badge("Proof of payment", "blue")],
        title: "Proof of payment received",
        intro: `${order.customer_name} has sent proof of their bank transfer. Check that the money is in your account before you mark the order as paid.`,
        body: detailsPanel([
          { label: "Order", value: reference },
          { label: "Customer", value: String(order.customer_name) },
        ]),
        buttons: [{ label: "Open orders", href: dashboard }],
        footerNote: "A screenshot can be faked, so always check your bank account before sending the order.",
      },
    });
  } catch (error) {
    console.error("[payment proof] alert not sent", { orderId, error });
  }
}
