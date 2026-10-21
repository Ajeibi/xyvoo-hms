import { isPublicHost } from "@/lib/net/public-host";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { brandIconFor } from "./social-brand-icons";
import { detectPlatform, type StoreSocials } from "./socials";

/*
 * For a social link on a site we have no logo for, fetch that site's own icon
 * (favicon) once, when the merchant saves, and keep a copy in our storage. The
 * shop then shows it from XYVOO, so shoppers' browsers never contact the site.
 */

const BUCKET = "store-products";
const MAX_BYTES = 100 * 1024;
const TIMEOUT_MS = 4000;

const IMAGE_TYPES: Record<string, string> = {
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
  "image/png": "png",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/jpeg": "jpg",
};

async function fetchFavicon(host: string): Promise<{ bytes: Uint8Array; type: string; ext: string } | null> {
  if (!(await isPublicHost(host))) return null;
  try {
    // No redirects: a redirect could point somewhere we haven't checked.
    const res = await fetch(`https://${host}/favicon.ico`, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { "User-Agent": "XYVOO icon fetcher" } });
    const type = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const ext = IMAGE_TYPES[type];
    if (!res.ok || !ext) return null;
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_BYTES) return null;
    // SVG can carry scripts; we only show it through <img>, which doesn't run them, but skip it to be safe.
    if (ext === "svg") return null;
    return { bytes, type, ext };
  } catch {
    return null;
  }
}

/**
 * Adds stored icons for the shop's "other" links that need one, keeping any
 * already saved. Never throws: a link without an icon just shows a globe.
 */
export async function withSocialFavicons(tenantId: string, socials: StoreSocials, previous: StoreSocials | null): Promise<StoreSocials> {
  const known = { ...(previous?.icons ?? {}) };
  const hosts = new Set<string>();
  for (const href of socials.other ?? []) {
    if (detectPlatform(href) !== "other" || brandIconFor(href)) continue;
    try {
      hosts.add(new URL(href).hostname.toLowerCase());
    } catch {
      // Not a link we can use.
    }
  }

  const icons: Record<string, string> = {};
  const storage = createServerSupabaseClient().storage.from(BUCKET);
  await Promise.all(
    [...hosts].map(async (host) => {
      if (known[host]) return void (icons[host] = known[host]);
      const icon = await fetchFavicon(host);
      if (!icon) return;
      const path = `${tenantId}/social-icons/${host.replace(/[^a-z0-9.-]/g, "")}.${icon.ext}`;
      const { error } = await storage.upload(path, icon.bytes, { contentType: icon.type, upsert: true, cacheControl: "604800" });
      if (!error) icons[host] = storage.getPublicUrl(path).data.publicUrl;
    }),
  );
  return Object.keys(icons).length ? { ...socials, icons } : socials;
}
