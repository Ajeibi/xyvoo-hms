import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sniffImageType, IMAGE_EXTENSIONS } from "@/lib/store/reviews";

/*
 * Photos of a guest's ID, kept in a private bucket and shown to staff through a link that
 * expires. The bucket is made by the migration; saving makes it if the migration was skipped.
 */

export const ID_PHOTO_BUCKET = "hotel-id-photos";
export const MAX_ID_PHOTO_BYTES = 5 * 1024 * 1024;
/** Most photos kept per booking: front and back of an ID, with a spare for a second guest. */
export const MAX_ID_PHOTOS_PER_BOOKING = 6;
const SIGNED_SECONDS = 10 * 60;

export const ID_PHOTO_SIDES = ["front", "back"] as const;
export type IdPhotoSide = (typeof ID_PHOTO_SIDES)[number];

export type IdPhoto = {
  id: string;
  side: IdPhotoSide;
  createdAt: string;
  url: string | null;
};

/** Storage path for a photo. The tenant and booking come first so one hotel can't reach another's files. */
export function idPhotoPath(tenantId: string, reservationId: string, type: string, uuid: string = randomUUID()) {
  return `${tenantId}/${reservationId}/${uuid}.${IMAGE_EXTENSIONS[type] ?? "jpg"}`;
}

/** Judges a photo by its own first bytes, not its name or what the browser says. Returns why it can't be kept, or the type. */
export function checkIdPhoto(bytes: Uint8Array): { error: string } | { type: string } {
  if (bytes.length === 0) return { error: "That photo is empty." };
  if (bytes.length > MAX_ID_PHOTO_BYTES) return { error: "That photo is too large. Keep it under 5 MB." };
  const type = sniffImageType(bytes);
  if (!type) return { error: "Use a JPEG, PNG or WebP photo." };
  return { type };
}

export async function saveIdPhoto(
  db: SupabaseClient,
  input: {
    tenantId: string;
    reservationId: string;
    guestId: string | null;
    side: IdPhotoSide;
    bytes: Uint8Array;
    type: string;
    userId: string | null;
  },
): Promise<{ id: string } | { error: string }> {
  const path = idPhotoPath(input.tenantId, input.reservationId, input.type);
  let upload = await db.storage.from(ID_PHOTO_BUCKET).upload(path, input.bytes, { contentType: input.type, upsert: false });
  if (upload.error && /bucket/i.test(upload.error.message)) {
    await db.storage.createBucket(ID_PHOTO_BUCKET, { public: false }).catch(() => undefined);
    upload = await db.storage.from(ID_PHOTO_BUCKET).upload(path, input.bytes, { contentType: input.type, upsert: false });
  }
  if (upload.error) {
    console.error("[id photo] not stored", upload.error.message);
    return { error: "We couldn't upload that just now. Please try again." };
  }
  const { data, error } = await db
    .schema("hotel")
    .from("reservation_id_photos")
    .insert({
      tenant_id: input.tenantId,
      reservation_id: input.reservationId,
      guest_id: input.guestId,
      side: input.side,
      storage_path: path,
      content_type: input.type,
      size_bytes: input.bytes.length,
      captured_by: input.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    await db.storage.from(ID_PHOTO_BUCKET).remove([path]).catch(() => undefined);
    if (error?.code === "42P01") return { error: "ID photos are not set up yet. Apply the id_photos migration." };
    console.error("[id photo] not recorded", error?.message);
    return { error: "We couldn't save that just now. Please try again." };
  }
  return { id: data.id as string };
}

/** The booking's photos, each with a link that works for a few minutes. Empty if the table isn't there yet. */
export async function listIdPhotos(db: SupabaseClient, tenantId: string, reservationId: string): Promise<IdPhoto[]> {
  const { data, error } = await db
    .schema("hotel")
    .from("reservation_id_photos")
    .select("id,side,storage_path,created_at")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  const paths = data.map((p) => p.storage_path as string);
  const { data: signed } = paths.length
    ? await db.storage.from(ID_PHOTO_BUCKET).createSignedUrls(paths, SIGNED_SECONDS)
    : { data: [] };
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
  return data.map((p) => ({
    id: p.id as string,
    side: p.side as IdPhotoSide,
    createdAt: p.created_at as string,
    url: urlByPath.get(p.storage_path as string) ?? null,
  }));
}

/** Deletes one photo and its file. Returns false if it isn't this booking's. */
export async function deleteIdPhoto(db: SupabaseClient, tenantId: string, reservationId: string, photoId: string) {
  const { data } = await db
    .schema("hotel")
    .from("reservation_id_photos")
    .select("id,storage_path")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("id", photoId)
    .maybeSingle();
  if (!data) return false;
  await db.storage.from(ID_PHOTO_BUCKET).remove([data.storage_path as string]).catch(() => undefined);
  await db.schema("hotel").from("reservation_id_photos").delete().eq("id", photoId);
  return true;
}
