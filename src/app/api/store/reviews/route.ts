import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { parseReviewImages, REVIEW_STATUSES, type DashboardReview } from "@/lib/store/reviews";
import { recomputeRatingStats } from "@/lib/store/reviews-server";

const PAGE_SIZE = 20;

/** GET /api/store/reviews?slug=&status=pending|published|hidden&page= — the shop's reviews, newest first, with counts per status. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const tenantId = resolved.access.tenantId;
  const status = REVIEW_STATUSES.find((s) => s === url.searchParams.get("status")) ?? "pending";
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const db = resolved.service.schema("store");

  const count = (s: string) => db.from("product_reviews").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", s);
  const [list, pending, published, hidden, profile] = await Promise.all([
    db
      .from("product_reviews")
      .select("id, product_id, customer_name, rating, title, comment, images, verified, status, reply, created_at, order_id, products(name, image_url)")
      .eq("tenant_id", tenantId)
      .eq("status", status)
      .order("created_at", { ascending: false })
      .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    count("pending"),
    count("published"),
    count("hidden"),
    db.from("business_profile").select("reviews_auto_publish").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  if (list.error) {
    if (list.error.code === "42703") return NextResponse.json({ error: "Customer reviews aren't switched on for your shop yet. Please try again later." }, { status: 503 });
    console.error("[reviews] list failed", list.error);
    return NextResponse.json({ error: "We couldn't load your reviews. Please refresh the page." }, { status: 500 });
  }

  const reviews: DashboardReview[] = (list.data || []).map((r) => {
    const product = (Array.isArray(r.products) ? r.products[0] : r.products) as { name: string; image_url: string | null } | null;
    return {
      id: r.id as string,
      productId: r.product_id as string,
      productName: product?.name ?? "A product you've removed",
      productImage: product?.image_url ?? null,
      customerName: r.customer_name as string,
      rating: Number(r.rating),
      title: (r.title as string | null) ?? null,
      comment: (r.comment as string | null) ?? null,
      images: parseReviewImages(r.images),
      verified: Boolean(r.verified),
      status: r.status as DashboardReview["status"],
      reply: (r.reply as string | null) ?? null,
      createdAt: r.created_at as string,
      orderId: (r.order_id as string | null) ?? null,
    };
  });
  const counts = { pending: pending.count ?? 0, published: published.count ?? 0, hidden: hidden.count ?? 0 };
  return NextResponse.json({
    reviews,
    counts,
    status,
    page,
    pageCount: Math.max(1, Math.ceil(counts[status] / PAGE_SIZE)),
    autoPublish: Boolean(profile.data?.reviews_auto_publish),
    canManageSettings: resolved.capabilities.canManageSettings,
  });
}

const ActionSchema = z.union([
  z.object({ slug: z.string(), id: z.string().uuid(), action: z.enum(["approve", "hide", "delete"]) }),
  z.object({ slug: z.string(), id: z.string().uuid(), action: z.literal("reply"), reply: z.string().trim().max(1000, "Keep your reply under 1,000 characters.") }),
  z.object({ slug: z.string(), autoPublish: z.boolean() }),
]);

/**
 * PATCH /api/store/reviews — { id, action: approve | hide | delete }, { id, action: "reply", reply }
 * (an empty reply removes it), or { autoPublish } to publish new reviews without approval.
 */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Please check and try again." }, { status: 400 });
  const tenantId = resolved.access.tenantId;
  const db = resolved.service.schema("store");
  const input = parsed.data;

  if ("autoPublish" in input) {
    if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change this." }, { status: 403 });
    const { error } = await db.from("business_profile").update({ reviews_auto_publish: input.autoPublish }).eq("tenant_id", tenantId);
    if (error) return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
    return NextResponse.json({ autoPublish: input.autoPublish });
  }
  if (!resolved.capabilities.canManageProducts) return NextResponse.json({ error: "You can't manage reviews." }, { status: 403 });

  const { data: review } = await db.from("product_reviews").select("id, product_id").eq("tenant_id", tenantId).eq("id", input.id).maybeSingle();
  if (!review) return NextResponse.json({ error: "That review no longer exists." }, { status: 404 });

  let error;
  if (input.action === "delete") ({ error } = await db.from("product_reviews").delete().eq("tenant_id", tenantId).eq("id", input.id));
  else if (input.action === "reply")
    ({ error } = await db
      .from("product_reviews")
      .update({ reply: input.reply || null, replied_at: input.reply ? new Date().toISOString() : null })
      .eq("tenant_id", tenantId)
      .eq("id", input.id));
  else ({ error } = await db.from("product_reviews").update({ status: input.action === "approve" ? "published" : "hidden" }).eq("tenant_id", tenantId).eq("id", input.id));
  if (error) {
    console.error("[reviews] update failed", error);
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }
  await recomputeRatingStats(resolved.service, tenantId, review.product_id as string);
  return NextResponse.json({ ok: true });
}
