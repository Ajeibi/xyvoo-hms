import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { claimOrderEmail, releaseOrderEmail } from "./order-events";
import { reviewerName } from "./reviews";

const store = () => createServerSupabaseClient().schema("store");

/** A product's star average and count, from its published reviews only. */
export async function recomputeRatingStats(service: SupabaseClient, tenantId: string, productId: string) {
  const db = service.schema("store");
  const published = await db.from("product_reviews").select("rating").eq("product_id", productId).eq("tenant_id", tenantId).eq("status", "published");
  // Before the reviews migration there's no status column: every review counts, as before.
  const { data: reviews } =
    published.error?.code === "42703" ? await db.from("product_reviews").select("rating").eq("product_id", productId).eq("tenant_id", tenantId) : published;
  const ratings = (reviews || []).map((r) => Number(r.rating));
  const count = ratings.length;
  const average = count ? ratings.reduce((sum, r) => sum + r, 0) / count : 0;
  await db.from("products").update({ rating_average: Math.round(average * 100) / 100, rating_count: count }).eq("id", productId).eq("tenant_id", tenantId);
}

/** The order's private review link token, made the first time it's needed. */
export async function ensureReviewToken(tenantId: string, orderId: string): Promise<string | null> {
  const { data } = await store().from("orders").select("review_token").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();
  if (!data) return null;
  if (data.review_token) return data.review_token as string;
  const token = randomBytes(32).toString("hex");
  const { error } = await store().from("orders").update({ review_token: token }).eq("tenant_id", tenantId).eq("id", orderId).is("review_token", null);
  if (error) return null;
  // Another request may have set one at the same moment: use whatever is stored.
  const { data: again } = await store().from("orders").select("review_token").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle();
  return (again?.review_token as string | null) ?? null;
}

export function reviewPageUrl(slug: string, token: string) {
  return `${EMAIL_SITE_URL}/shop/${encodeURIComponent(slug)}/review/${token}`;
}

/**
 * After delivery: one email asking the shopper to rate what they bought, with
 * their private review link. Sent once per order; never throws.
 */
export async function sendReviewRequest(tenantId: string, orderId: string) {
  try {
    const db = createServerSupabaseClient();
    const [{ data: order }, { data: tenant }, { data: profile }] = await Promise.all([
      db.schema("store").from("orders").select("id, customer_name, customer_email, status, order_items(product_name)").eq("tenant_id", tenantId).eq("id", orderId).maybeSingle(),
      db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
      db.schema("store").from("business_profile").select("business_email").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (!order?.customer_email || !tenant || order.status !== "Delivered") return;
    const token = await ensureReviewToken(tenantId, orderId);
    if (!token) return;

    const storeName = (tenant.display_name as string | null)?.trim() || String(tenant.subdomain || tenant.name);
    const slug = String(tenant.subdomain || tenant.name);
    const items = ((order.order_items as { product_name: string }[]) || []).map((i) => i.product_name);
    const claim = await claimOrderEmail(tenantId, orderId, "review_request", `Email sent to ${order.customer_email}: asked for a review`);
    if (!claim) return;
    const url = reviewPageUrl(slug, token);
    const firstName = String(order.customer_name || "").trim().split(/\s+/)[0] || "there";
    try {
      await sendBrandedEmail({
        to: order.customer_email as string,
        replyTo: (profile?.business_email as string | null) || null,
        subject: `How did we do? Rate your order from ${storeName}`,
        text: [`Hello ${firstName},`, "", `Your order from ${storeName} has been delivered. We'd love to know what you think.`, "", ...items.map((i) => `• ${i}`), "", `Rate your items and add a comment or photos: ${url}`, "", "It only takes a minute, and it helps other shoppers."].join("\n"),
        layout: {
          preheader: `Tell ${storeName} what you think of your order. It takes a minute.`,
          badges: [badge("Delivered", "green")],
          title: "How did we do?",
          intro: `Hello ${firstName}. Your order from ${storeName} has been delivered. We'd love to hear what you think: rate each item, leave a comment, and add a photo if you like.`,
          body: detailsPanel(items.slice(0, 8).map((name) => ({ label: "Item", value: name }))),
          buttons: [{ label: "Rate your order", href: url }],
          footerNote: `You're receiving this because you ordered from ${storeName}. Only people who bought an item can review it.`,
        },
      });
      await store().from("orders").update({ review_requested_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", orderId);
    } catch (error) {
      await releaseOrderEmail(tenantId, claim);
      throw error;
    }
  } catch (error) {
    console.error("[reviews] review request not sent", { orderId, error });
  }
}

/** Tells the shop a review has arrived (and whether it's waiting for approval). Never throws. */
export async function notifyShopOfReview(tenantId: string, input: { customerName: string; count: number; lowest: number; waiting: boolean }) {
  try {
    const db = createServerSupabaseClient();
    const [{ data: tenant }, { data: profile }] = await Promise.all([
      db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
      db.schema("store").from("business_profile").select("business_email").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    let to = (profile?.business_email as string | null) || null;
    if (!to) {
      const { data: owner } = await db.schema("store").from("memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle();
      if (owner) to = (await db.auth.admin.getUserById(owner.user_id as string)).data.user?.email ?? null;
    }
    if (!tenant || !to) return;
    const slug = String(tenant.subdomain || tenant.name);
    const storeName = (tenant.display_name as string | null)?.trim() || slug;
    const who = reviewerName(input.customerName);
    const reviews = input.count === 1 ? "a review" : `${input.count} reviews`;
    const link = `${EMAIL_SITE_URL}/storefront/${slug}/reviews`;
    await sendBrandedEmail({
      to,
      subject: input.waiting ? `${who} left ${reviews}: approve to publish` : `${who} left ${reviews}`,
      text: [`${who} has reviewed what they bought from ${storeName}.`, input.waiting ? "It's waiting for you to approve it before it shows in your shop." : "It's now showing in your shop.", "", `See it: ${link}`].join("\n"),
      layout: {
        preheader: input.waiting ? "A new review is waiting for your approval." : "A new review is live in your shop.",
        badges: [badge(input.waiting ? "To approve" : "New review", input.lowest <= 2 ? "amber" : "green")],
        title: input.waiting ? "A new review to approve" : "You have a new review",
        intro: `${who} has reviewed what they bought from ${storeName}.${input.waiting ? " Approve it to show it in your shop, or hide it." : ""}`,
        buttons: [{ label: input.waiting ? "Review and approve" : "See your reviews", href: link }],
        footerNote: `You're receiving this because a customer reviewed an order from ${storeName}.`,
      },
    });
  } catch (error) {
    console.error("[reviews] shop not told about review", { tenantId, error });
  }
}

export const REVIEW_PHOTO_BUCKET = "store-products";

/** The public web address a photo in this storage path will have. */
export function reviewPhotoUrlPrefix(path: string) {
  return createServerSupabaseClient().storage.from(REVIEW_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

export type ReviewableOrder = {
  id: string;
  customerName: string;
  status: string;
  placedAt: string;
  items: Array<{
    orderItemId: string;
    productId: string | null;
    name: string;
    options: string;
    imageUrl: string | null;
    review: { rating: number; title: string | null; comment: string | null; images: string[]; status: string } | null;
  }>;
};

/**
 * The order behind a review link, for this shop only, with each item and any
 * review already left for it. Null when the link doesn't match an order here.
 */
export async function loadReviewableOrder(tenantId: string, token: string): Promise<ReviewableOrder | null> {
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const db = store();
  const { data: order } = await db
    .from("orders")
    .select("id, customer_name, status, created_at, order_items(id, product_id, product_name, variant_id)")
    .eq("tenant_id", tenantId)
    .eq("review_token", token)
    .maybeSingle();
  if (!order) return null;
  const items = (order.order_items as Array<{ id: string; product_id: string | null; product_name: string; variant_id: string | null }>) || [];
  const productIds = [...new Set(items.map((i) => i.product_id).filter((v): v is string => Boolean(v)))];
  const variantIds = [...new Set(items.map((i) => i.variant_id).filter((v): v is string => Boolean(v)))];
  const [{ data: products }, { data: variants }, { data: reviews }] = await Promise.all([
    productIds.length ? db.from("products").select("id, image_url").eq("tenant_id", tenantId).in("id", productIds) : Promise.resolve({ data: [] as { id: string; image_url: string | null }[] }),
    variantIds.length ? db.from("product_variants").select("id, options").in("id", variantIds) : Promise.resolve({ data: [] as { id: string; options: unknown }[] }),
    db.from("product_reviews").select("order_item_id, rating, title, comment, images, status").eq("tenant_id", tenantId).eq("order_id", order.id),
  ]);
  const imageFor = new Map((products || []).map((p) => [p.id as string, (p.image_url as string | null) ?? null]));
  const optionsFor = new Map((variants || []).map((v) => [v.id as string, Object.values((v.options as Record<string, string>) || {}).join(" / ")]));
  const reviewFor = new Map((reviews || []).map((r) => [r.order_item_id as string, r]));
  return {
    id: order.id as string,
    customerName: String(order.customer_name || ""),
    status: String(order.status),
    placedAt: String(order.created_at),
    items: items.map((i) => {
      const r = reviewFor.get(i.id);
      return {
        orderItemId: i.id,
        productId: i.product_id,
        name: i.product_name,
        options: i.variant_id ? optionsFor.get(i.variant_id) ?? "" : "",
        imageUrl: i.product_id ? imageFor.get(i.product_id) ?? null : null,
        review: r
          ? {
              rating: Number(r.rating),
              title: (r.title as string | null) ?? null,
              comment: (r.comment as string | null) ?? null,
              images: ((r.images as Array<{ url: string }>) || []).map((x) => x.url),
              status: String(r.status),
            }
          : null,
      };
    }),
  };
}
