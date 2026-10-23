import { createHash } from "node:crypto";
import { isPublicHost } from "@/lib/net/public-host";
import { getServerEnv } from "@/lib/env";
import { shopChanged } from "@/lib/store/site/shop-changed";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * Product photos added by address (a spreadsheet import, or a link pasted in
 * the product form) live on someone else's site. Shops can't resize those, so
 * shoppers download full-size files, and the photo breaks if that site moves
 * it. So we keep our own copy in the shop's storage, where every photo is
 * resized for each screen, and point the product at it.
 */

const BUCKET = "store-products";
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;
/** Photos fetched at once, so a big import doesn't hammer the other site. */
const CONCURRENCY = 4;
/** Products read at a time (also stays under the database's 1,000-row page). */
const PAGE = 200;

/** SVG is left out: it can carry scripts. */
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const storedPrefix = () => `${getServerEnv().supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/`;

/** A photo on another site (not already in our storage) that we could copy. */
export function isExternalImage(url: string | null | undefined): url is string {
  if (!url) return false;
  if (url.startsWith(storedPrefix())) return false;
  return /^https?:\/\//i.test(url);
}

/** Fetches a photo from the public internet, following a few redirects, each to a host checked again. */
async function fetchImage(url: string): Promise<{ bytes: Uint8Array; type: string; ext: string } | null> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.username || parsed.password) return null;
    if (!(await isPublicHost(parsed.hostname))) return null;

    let res: Response;
    try {
      res = await fetch(parsed, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "XYVOO product photo copier", Accept: "image/*" } });
    } catch {
      return null;
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return null;
      current = new URL(next, parsed).toString();
      continue;
    }
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!ext) return null;
    if (Number(res.headers.get("content-length") || 0) > MAX_BYTES) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES || !looksLike(ext, bytes)) return null;
    return { bytes, type, ext };
  }
  return null;
}

/** The file really is the kind of image it says it is (its first bytes), not a page or script with an image label. */
function looksLike(ext: string, b: Uint8Array) {
  const at = (i: number, ...v: number[]) => v.every((x, j) => b[i + j] === x);
  const ascii = (i: number, s: string) => [...s].every((c, j) => b[i + j] === c.charCodeAt(0));
  if (ext === "jpg") return at(0, 0xff, 0xd8, 0xff);
  if (ext === "png") return at(0, 0x89, 0x50, 0x4e, 0x47);
  if (ext === "gif") return ascii(0, "GIF8");
  if (ext === "webp") return ascii(0, "RIFF") && ascii(8, "WEBP");
  if (ext === "avif") return ascii(4, "ftyp");
  return false;
}

/**
 * Copies one photo into the shop's storage and returns its new address, or
 * null if it couldn't be fetched or isn't a photo. The file is named after the
 * original address, so the same photo is only ever stored once per shop.
 */
export async function copyExternalImage(tenantId: string, url: string): Promise<string | null> {
  const image = await fetchImage(url);
  if (!image) return null;
  const storage = createServerSupabaseClient().storage.from(BUCKET);
  const name = createHash("sha256").update(url).digest("hex").slice(0, 32);
  const path = `${tenantId}/imported/${name}.${image.ext}`;
  const { error } = await storage.upload(path, image.bytes, { contentType: image.type, upsert: true, cacheControl: "31536000" });
  if (error) {
    console.error("[external-images] not stored", { tenantId, error: error.message });
    return null;
  }
  return storage.getPublicUrl(path).data.publicUrl;
}

type ProductImageRow = {
  id: string;
  image_url: string | null;
  image_urls: string[] | null;
  product_variants: Array<{ id: string; image_url: string | null }> | null;
};

/** Runs `fn` over `items`, a few at a time. */
async function inBatches<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

export type CopyImagesResult = { products: number; copied: number; failed: number };

/**
 * Copies the photos on another site for these products (or every product in
 * the shop) into its storage, and updates the products to use the copies. A
 * photo that can't be copied keeps its original address. Never throws.
 */
export async function copyProductImages(tenantId: string, productIds?: string[]): Promise<CopyImagesResult> {
  const result: CopyImagesResult = { products: 0, copied: 0, failed: 0 };
  const db = createServerSupabaseClient().schema("store");
  try {
    for (let page = 0; ; page++) {
      const base = db.from("products").select("id, image_url, image_urls, product_variants(id, image_url)").eq("tenant_id", tenantId).order("id");
      const ids = productIds?.slice(page * PAGE, (page + 1) * PAGE);
      if (ids && !ids.length) break;
      const { data, error } = await (ids ? base.in("id", ids) : base.range(page * PAGE, (page + 1) * PAGE - 1));
      if (error) throw new Error(error.message);
      const rows = (data || []) as ProductImageRow[];

      const external = new Set<string>();
      for (const row of rows) {
        for (const url of [row.image_url, ...(row.image_urls || []), ...(row.product_variants || []).map((v) => v.image_url)]) if (isExternalImage(url)) external.add(url);
      }
      const copies = new Map<string, string>();
      await inBatches([...external], CONCURRENCY, async (url) => {
        const stored = await copyExternalImage(tenantId, url);
        if (stored) {
          copies.set(url, stored);
          result.copied++;
        } else result.failed++;
      });

      const swap = (url: string | null) => (url && copies.get(url)) || url;
      for (const row of rows) {
        const imageUrl = swap(row.image_url);
        const imageUrls = (row.image_urls || []).map((u) => swap(u) as string);
        const productChanged = imageUrl !== row.image_url || imageUrls.some((u, i) => u !== row.image_urls?.[i]);
        const variants = (row.product_variants || []).filter((v) => swap(v.image_url) !== v.image_url);
        if (!productChanged && !variants.length) continue;
        result.products++;
        if (productChanged) await db.from("products").update({ image_url: imageUrl, image_urls: imageUrls }).eq("id", row.id).eq("tenant_id", tenantId);
        for (const v of variants) await db.from("product_variants").update({ image_url: swap(v.image_url) }).eq("id", v.id).eq("product_id", row.id);
      }
      if (!ids && rows.length < PAGE) break;
    }
  } catch (err) {
    console.error("[external-images] products not updated", { tenantId, err });
  }
  return result;
}

/** Copies outside collection banners into the shop's storage. Never throws. */
export async function copyCollectionImages(tenantId: string): Promise<CopyImagesResult> {
  const result: CopyImagesResult = { products: 0, copied: 0, failed: 0 };
  const db = createServerSupabaseClient().schema("store");
  try {
    const { data, error } = await db.from("collections").select("id, image_url").eq("tenant_id", tenantId);
    if (error) throw new Error(error.message);
    await inBatches((data || []).filter((c) => isExternalImage(c.image_url as string | null)), CONCURRENCY, async (c) => {
      const stored = await copyExternalImage(tenantId, c.image_url as string);
      if (!stored) return void result.failed++;
      result.copied++;
      await db.from("collections").update({ image_url: stored }).eq("id", c.id).eq("tenant_id", tenantId).eq("image_url", c.image_url);
    });
    // Collections are part of the shop's cached data.
    if (result.copied) shopChanged(tenantId);
  } catch (err) {
    console.error("[external-images] collections not updated", { tenantId, err });
  }
  return result;
}

/** Image fields in the site settings: the logo, favicon and share image, and every { url, alt } image in a section. */
const SITE_IMAGE_KEYS = new Set(["logoUrl", "faviconUrl", "shareImageUrl"]);

function collectSiteImages(value: unknown, found: Set<string>) {
  if (Array.isArray(value)) return value.forEach((v) => collectSiteImages(v, found));
  if (!value || typeof value !== "object") return;
  const obj = value as Record<string, unknown>;
  for (const [key, v] of Object.entries(obj)) {
    const isImage = SITE_IMAGE_KEYS.has(key) || (key === "url" && "alt" in obj);
    if (isImage && typeof v === "string" && isExternalImage(v)) found.add(v);
    else collectSiteImages(v, found);
  }
}

function replaceSiteImages<T>(value: T, copies: Map<string, string>): T {
  if (Array.isArray(value)) return value.map((v) => replaceSiteImages(v, copies)) as T;
  if (!value || typeof value !== "object") return value;
  const obj = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(obj).map(([key, v]) => {
      const isImage = SITE_IMAGE_KEYS.has(key) || (key === "url" && "alt" in obj);
      return [key, isImage && typeof v === "string" ? copies.get(v) ?? v : replaceSiteImages(v, copies)];
    }),
  ) as T;
}

/** Copies outside images in the website (draft and published) into the shop's storage. Never throws. */
export async function copySiteImages(tenantId: string): Promise<CopyImagesResult> {
  const result: CopyImagesResult = { products: 0, copied: 0, failed: 0 };
  const db = createServerSupabaseClient().schema("store");
  try {
    const { data: site, error } = await db.from("sites").select("draft, published").eq("tenant_id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!site) return result;
    const found = new Set<string>();
    collectSiteImages(site.draft, found);
    collectSiteImages(site.published, found);
    if (!found.size) return result;
    const copies = new Map<string, string>();
    await inBatches([...found], CONCURRENCY, async (url) => {
      const stored = await copyExternalImage(tenantId, url);
      if (stored) {
        copies.set(url, stored);
        result.copied++;
      } else result.failed++;
    });
    if (copies.size) {
      await db
        .from("sites")
        .update({ draft: replaceSiteImages(site.draft, copies), published: site.published ? replaceSiteImages(site.published, copies) : site.published })
        .eq("tenant_id", tenantId);
      shopChanged(tenantId);
    }
  } catch (err) {
    console.error("[external-images] site not updated", { tenantId, err });
  }
  return result;
}

/** Every outside image a shop shows (products, collections, website) copied into its storage. */
export async function copyShopImages(tenantId: string) {
  const [products, collections, site] = [await copyProductImages(tenantId), await copyCollectionImages(tenantId), await copySiteImages(tenantId)];
  return { products, collections, site };
}

/** Whether a product (as saved) has any photo still on another site. */
export function hasExternalImages(row: { image_url?: string | null; image_urls?: string[] | null; product_variants?: Array<{ image_url?: string | null }> | null }) {
  return [row.image_url, ...(row.image_urls || []), ...(row.product_variants || []).map((v) => v.image_url)].some((u) => isExternalImage(u));
}
