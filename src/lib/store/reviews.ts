/*
 * Customer reviews: the rules for what a shopper can send, how their name is
 * shown, and which uploaded files count as photos. No server code here, so
 * the review page, the dashboard and tests can all use it.
 */
import { z } from "zod";

export const REVIEW_STATUSES = ["pending", "published", "hidden"] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const MAX_REVIEW_PHOTOS = 3;
export const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024;

export type ReviewImage = { url: string };

const text = (max: number) => z.string().trim().max(max, "That's longer than we can take. Please shorten it.");

/** What the review page sends: one entry per item the shopper wants to review. */
export const reviewSubmissionSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/, "This review link isn't valid."),
  displayName: text(60).min(1, "Tell us the name to show with your review."),
  reviews: z
    .array(
      z.object({
        orderItemId: z.string().uuid(),
        rating: z.number().int().min(1, "Choose a star rating.").max(5),
        title: text(100).optional().default(""),
        comment: text(2000).optional().default(""),
        images: z.array(z.string().url().max(1000)).max(MAX_REVIEW_PHOTOS, `Add up to ${MAX_REVIEW_PHOTOS} photos for each item.`).default([]),
      }),
    )
    .min(1, "Rate at least one item.")
    .max(50),
});
export type ReviewSubmission = z.infer<typeof reviewSubmissionSchema>;

/** "Ada Obi" → "Ada O.": enough to feel real, not enough to identify someone. */
export function reviewerName(fullName: string | null | undefined) {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "A customer";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

/**
 * The kind of picture a file really is, from its first bytes rather than the
 * name or type the browser claims. Only JPEG, PNG and WebP are accepted; SVGs
 * (which can carry scripts) and everything else are refused.
 */
export function sniffImageType(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) === "RIFF" &&
    String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]) === "WEBP"
  )
    return "image/webp";
  return null;
}

export const IMAGE_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Review photos live under this folder for the order, so a review can only use photos uploaded with its own link. */
export function reviewPhotoFolder(tenantId: string, orderId: string) {
  return `${tenantId}/reviews/${orderId}/`;
}

export function parseReviewImages(value: unknown): ReviewImage[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((v) => (v && typeof v === "object" && typeof (v as ReviewImage).url === "string" ? [{ url: (v as ReviewImage).url }] : [])).slice(0, MAX_REVIEW_PHOTOS);
}

export type DashboardReview = {
  id: string;
  productId: string;
  productName: string;
  productImage: string | null;
  customerName: string;
  rating: number;
  title: string | null;
  comment: string | null;
  images: ReviewImage[];
  verified: boolean;
  status: ReviewStatus;
  reply: string | null;
  createdAt: string;
  orderId: string | null;
};
