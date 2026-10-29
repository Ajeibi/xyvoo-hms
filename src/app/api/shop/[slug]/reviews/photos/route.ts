import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { IMAGE_EXTENSIONS, MAX_REVIEW_PHOTO_BYTES, reviewPhotoFolder, sniffImageType } from "@/lib/store/reviews";
import { REVIEW_PHOTO_BUCKET } from "@/lib/store/reviews-server";
import { requestT } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";

/**
 * POST /api/shop/<store>/reviews/photos (form data: token, file) — a photo for
 * a review. Only someone with the order's review link can upload, only real
 * JPEG, PNG or WebP pictures up to 5MB are kept, and they're stored in a
 * folder for that order, so a review can only use its own photos.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: (await requestT(req, slug))("errors.acShopNotFound") }, { status: 404 });
  const t = await shopperT(req, slug, tenant.id);

  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const file = form?.get("file");
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: t("errors.acReviewLinkInvalid") }, { status: 404 });

  const limit = await rateLimitShared(`review-photo:${token}:${clientIp(req)}`, 30, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: t("errors.acTooManyPhotos") }, { status: 429 });

  const db = createServerSupabaseClient();
  const { data: order } = await db.schema("store").from("orders").select("id, status").eq("tenant_id", tenant.id).eq("review_token", token).maybeSingle();
  if (!order) return NextResponse.json({ error: t("errors.acReviewLinkInvalid") }, { status: 404 });
  if (order.status !== "Delivered") return NextResponse.json({ error: t("errors.acReviewAfterDelivery") }, { status: 409 });

  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: t("errors.acChoosePhoto") }, { status: 400 });
  if (file.size > MAX_REVIEW_PHOTO_BYTES) return NextResponse.json({ error: t("errors.acPhotoTooLarge") }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return NextResponse.json({ error: t("errors.acPhotoType") }, { status: 400 });

  const path = `${reviewPhotoFolder(tenant.id, order.id as string)}${randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
  const { error } = await db.storage.from(REVIEW_PHOTO_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) {
    console.error("[review photos] upload failed", { tenantId: tenant.id, error });
    return NextResponse.json({ error: t("errors.acPhotoFailed") }, { status: 500 });
  }
  return NextResponse.json({ url: db.storage.from(REVIEW_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl }, { status: 201 });
}
