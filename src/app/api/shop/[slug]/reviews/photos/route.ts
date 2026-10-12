import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { IMAGE_EXTENSIONS, MAX_REVIEW_PHOTO_BYTES, reviewPhotoFolder, sniffImageType } from "@/lib/store/reviews";
import { REVIEW_PHOTO_BUCKET } from "@/lib/store/reviews-server";

/**
 * POST /api/shop/<store>/reviews/photos (form data: token, file) — a photo for
 * a review. Only someone with the order's review link can upload, only real
 * JPEG, PNG or WebP pictures up to 5MB are kept, and they're stored in a
 * folder for that order, so a review can only use its own photos.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Shop not found." }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const token = String(form?.get("token") ?? "");
  const file = form?.get("file");
  if (!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "This review link isn't valid." }, { status: 404 });

  const limit = await rateLimitShared(`review-photo:${token}:${clientIp(req)}`, 30, 60 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "You've added a lot of photos. Please wait a little and try again." }, { status: 429 });

  const db = createServerSupabaseClient();
  const { data: order } = await db.schema("store").from("orders").select("id, status").eq("tenant_id", tenant.id).eq("review_token", token).maybeSingle();
  if (!order) return NextResponse.json({ error: "This review link isn't valid." }, { status: 404 });
  if (order.status !== "Delivered") return NextResponse.json({ error: "You can review your order once it's been delivered." }, { status: 409 });

  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "Choose a photo to add." }, { status: 400 });
  if (file.size > MAX_REVIEW_PHOTO_BYTES) return NextResponse.json({ error: "That photo is too large. Please choose one under 5MB." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) return NextResponse.json({ error: "Please choose a JPEG, PNG or WebP photo." }, { status: 400 });

  const path = `${reviewPhotoFolder(tenant.id, order.id as string)}${randomUUID()}.${IMAGE_EXTENSIONS[type]}`;
  const { error } = await db.storage.from(REVIEW_PHOTO_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (error) {
    console.error("[review photos] upload failed", { tenantId: tenant.id, error });
    return NextResponse.json({ error: "We couldn't add that photo just now. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ url: db.storage.from(REVIEW_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl }, { status: 201 });
}
