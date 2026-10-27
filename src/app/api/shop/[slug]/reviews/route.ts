import { after, NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { MAX_REVIEW_PHOTOS, reviewPhotoFolder, reviewSubmissionSchema } from "@/lib/store/reviews";
import { issueMessage, requestT } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";
import { notifyShopOfReview, recomputeRatingStats, reviewPhotoUrlPrefix } from "@/lib/store/reviews-server";

/**
 * POST /api/shop/<store>/reviews { token, displayName, reviews: [{ orderItemId, rating, title, comment, images }] }
 *
 * Reviews from the private link emailed after delivery. Each is tied to the
 * item bought (one per item; sending again updates it). They wait for the
 * shop's approval unless the shop publishes reviews automatically.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: (await requestT(req, slug))("errors.acShopNotFound") }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);
  const limit = await rateLimitShared(`reviews:${tenant.id}:${clientIp(req)}`, 20, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: t("errors.acTooManyTries") }, { status: 429 });

  const parsed = reviewSubmissionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const photosMax = { [`Add up to ${MAX_REVIEW_PHOTOS} photos for each item.`]: ["errors.acReviewPhotosMax", { count: MAX_REVIEW_PHOTOS }] } as const;
    return NextResponse.json({ error: issueMessage(t, issue, "errors.acCheckReview", photosMax), field: issue?.path.join(".") }, { status: 400 });
  }
  const { token, displayName, reviews } = parsed.data;

  const service = createServerSupabaseClient();
  const db = service.schema("store");
  const [{ data: order }, { data: profile }] = await Promise.all([
    db.from("orders").select("id, status, customer_email, order_items(id, product_id)").eq("tenant_id", tenant.id).eq("review_token", token).maybeSingle(),
    db.from("business_profile").select("reviews_auto_publish").eq("tenant_id", tenant.id).maybeSingle(),
  ]);
  if (!order) return NextResponse.json({ error: t("errors.acReviewLinkInvalid") }, { status: 404 });
  if (order.status !== "Delivered") return NextResponse.json({ error: t("errors.acReviewAfterDelivery") }, { status: 409 });

  const itemProduct = new Map(((order.order_items as Array<{ id: string; product_id: string | null }>) || []).map((i) => [i.id, i.product_id]));
  // Photos must be ones uploaded with this order's own link.
  const photoPrefix = reviewPhotoUrlPrefix(reviewPhotoFolder(tenant.id, order.id as string));
  for (const r of reviews) {
    if (!itemProduct.get(r.orderItemId)) return NextResponse.json({ error: t("errors.acReviewItemNotInOrder") }, { status: 400 });
    if (r.images.some((url) => !url.startsWith(photoPrefix))) return NextResponse.json({ error: t("errors.acReviewPhotosAgain") }, { status: 400 });
  }

  const status = profile?.reviews_auto_publish ? "published" : "pending";
  const rows = reviews.map((r) => ({
    tenant_id: tenant.id,
    product_id: itemProduct.get(r.orderItemId) as string,
    order_id: order.id,
    order_item_id: r.orderItemId,
    verified: true,
    customer_name: displayName,
    customer_email: (order.customer_email as string | null) ?? null,
    rating: r.rating,
    title: r.title || null,
    comment: r.comment || null,
    images: r.images.map((url) => ({ url })),
    // A changed review goes back for approval, just like a new one.
    status,
  }));
  const { error } = await db.from("product_reviews").upsert(rows, { onConflict: "order_item_id" });
  if (error) {
    console.error("[reviews] save failed", { tenantId: tenant.id, error });
    return NextResponse.json({ error: t("errors.acReviewNotSaved") }, { status: 500 });
  }

  const productIds = [...new Set(rows.map((r) => r.product_id))];
  after(async () => {
    for (const id of productIds) await recomputeRatingStats(service, tenant.id, id);
    await notifyShopOfReview(tenant.id, { customerName: displayName, count: rows.length, lowest: Math.min(...rows.map((r) => r.rating)), waiting: status === "pending" });
  });
  return NextResponse.json({ ok: true, published: status === "published" });
}
