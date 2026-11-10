import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sniffImageType } from "@/lib/store/reviews";

/*
 * Files for HR (scanned staff documents, clock-in photos) in the private bucket "hr-private".
 * The bucket has no storage policies, so only the server's service client reaches it, and only
 * after the app has checked who is asking. Files are shown through links that expire.
 * Every path starts with the hotel's id.
 */

export const HR_BUCKET = "hr-private";
export const MAX_HR_DOCUMENT_BYTES = 8 * 1024 * 1024;
export const MAX_CLOCK_PHOTO_BYTES = 400 * 1024;
const SIGNED_SECONDS = 10 * 60;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" };

/** Judges a file by its own first bytes. PDFs and photos only. */
export function sniffDocumentType(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46 && bytes[4] === 0x2d) return "application/pdf";
  return sniffImageType(bytes);
}

export function hrFilePath(tenantId: string, folder: string, type: string) {
  return `${tenantId}/${folder}/${randomUUID()}.${EXT[type] ?? "bin"}`;
}

export async function uploadHrFile(service: SupabaseClient, path: string, bytes: Uint8Array, type: string): Promise<{ error: string | null }> {
  let up = await service.storage.from(HR_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  if (up.error && /bucket/i.test(up.error.message)) {
    await service.storage.createBucket(HR_BUCKET, { public: false }).catch(() => undefined);
    up = await service.storage.from(HR_BUCKET).upload(path, bytes, { contentType: type, upsert: false });
  }
  if (up.error) {
    console.error("[hr file] not stored", up.error.message);
    return { error: "Couldn't upload the file. Please try again." };
  }
  return { error: null };
}

export async function removeHrFiles(service: SupabaseClient, paths: string[]) {
  const list = paths.filter(Boolean);
  if (list.length) await service.storage.from(HR_BUCKET).remove(list).catch(() => undefined);
}

/** Links that expire for a set of paths, keyed by path. The caller must already be allowed to see them. */
export async function signHrFiles(service: SupabaseClient, tenantId: string, paths: (string | null | undefined)[], download = false): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p) && (p as string).startsWith(`${tenantId}/`)))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  const { data } = await service.storage.from(HR_BUCKET).createSignedUrls(list, SIGNED_SECONDS, download ? { download: true } : undefined);
  for (const d of data ?? []) if (d.path && d.signedUrl) out.set(d.path, d.signedUrl);
  return out;
}

/** Decodes a "data:image/jpeg;base64,..." photo from the clock screen. */
export function decodeClockPhoto(dataUrl: string): { bytes: Uint8Array; type: string } | null {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = new Uint8Array(Buffer.from(m[2], "base64"));
  if (!bytes.length || bytes.length > MAX_CLOCK_PHOTO_BYTES) return null;
  const type = sniffImageType(bytes);
  return type ? { bytes, type } : null;
}
