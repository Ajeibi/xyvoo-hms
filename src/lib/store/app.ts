/**
 * Each store is its own installable app (PWA): its own name, icon, colours and
 * start page, scoped to the store's address. On <store>.getxyvoo.com that's the
 * whole site; on /shop/<store> (the platform domain) it's that path only.
 */

/** The part of the site the store's app and service worker control. */
export function storeAppScope(basePath: string) {
  return basePath || "/";
}

/** Where the store's app files live, e.g. "/sw.js" on the subdomain or "/shop/linden/sw.js". */
export function storeAppPath(basePath: string, file: string) {
  return `${basePath}/${file.replace(/^\//, "")}`;
}

export type StoreAppManifestInput = {
  basePath: string;
  storeName: string;
  description: string | null;
  backgroundColour: string;
  themeColour: string;
};

/** The web app manifest for a store (served at <scope>/manifest.webmanifest). */
export function buildStoreAppManifest({ basePath, storeName, description, backgroundColour, themeColour }: StoreAppManifestInput) {
  const scope = storeAppScope(basePath);
  const name = storeName.trim().slice(0, 45) || "Shop";
  return {
    id: scope,
    name,
    // Shown under the home-screen icon: keep it short so it isn't cut off.
    short_name: name.length <= 12 ? name : name.split(/\s+/)[0].slice(0, 12),
    description: description?.slice(0, 300) || `Shop with ${name}.`,
    start_url: basePath ? `${basePath}?source=app` : "/?source=app",
    scope,
    display: "standalone",
    orientation: "portrait",
    background_color: backgroundColour,
    theme_color: themeColour,
    lang: "en",
    categories: ["shopping"],
    icons: [
      { src: storeAppPath(basePath, "app-icon/192"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: storeAppPath(basePath, "app-icon/512"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: storeAppPath(basePath, "app-icon/maskable"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** Up to two letters for a store's icon when it has no logo, e.g. "Nevan's Hair" -> "NH". */
export function storeInitials(storeName: string) {
  const words = storeName.replace(/[^\p{L}\p{N}\s]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "S";
  return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]).toUpperCase();
}
