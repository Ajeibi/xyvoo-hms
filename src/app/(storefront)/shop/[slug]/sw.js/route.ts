import { getStorefront } from "@/lib/store/site/storefront";
import { storeAppScope } from "@/lib/store/app";

/*
 * The store app's service worker:
 *   - shows push notifications (the shop's news, and updates the shopper asked
 *     for about their order, basket or a product back in stock)
 *   - opens the right page in the store when one is tapped
 *   - keeps the shop's code, styles and recent product photos on the device,
 *     so the app opens quickly, even on a slow connection
 *   - keeps the last pages the shopper looked at, so with no connection they
 *     can still look at them (marked as a saved copy); otherwise a "you're
 *     offline" page in the shop's own colours
 * Pages always come from the network first, so prices and stock are current
 * whenever there's a connection. Account, basket and checkout pages are never kept.
 */

type WorkerConfig = { storeName: string; bg: string; ink: string; accent: string; onAccent: string };

/** Bump when the caching rules change, so old copies are cleared. */
const CACHE_VERSION = "v2";

// Plain JavaScript for the browser. No template placeholders inside: settings come from CONFIG.
const WORKER_BODY = String.raw`
const scopeUrl = () => self.registration.scope.replace(/\/$/, "");
// On the platform domain the scope is "/shop/<store>" with no trailing slash (where the shop's pages live),
// which the browser also matches to "/shop/<store>-two/...". Pages of another shop are left alone.
const ownsUrl = (url) => { const base = scopeUrl(); return url === base || ["/", "?", "#"].some((c) => url.startsWith(base + c)); };
const inStore = (path) => scopeUrl() + (typeof path === "string" && /^\/(?![\/\\])/.test(path) ? path : "/");
// Tag the link so the store can see how many people opened each notification (counted only with their analytics consent).
const tagged = (url, tag) => url + (url.includes("?") ? "&" : "?") + "utm_source=notification&utm_medium=push"
  + (typeof tag === "string" ? "&utm_campaign=" + encodeURIComponent(tag.replace(/^store-notification-/, "")) : "");

// Several shops can share one address (/shop/<store>), so each keeps its own pages.
const STATIC_CACHE = "sf-static-" + CONFIG.version;
const IMAGE_CACHE = "sf-images-" + CONFIG.version;
const PAGE_CACHE = "sf-pages-" + CONFIG.version + "|" + scopeUrl();
const MAX_PAGES = 25;
const MAX_IMAGES = 80;
const MAX_STATIC = 200;
// Pages with someone's own details, or that change with every visit, are never kept.
const PRIVATE_PAGE = /\/(account|cart|checkout|reminders|unsubscribe|review)(\/|\?|$)/;

const trim = async (name, max) => {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.add(scopeUrl() + "/app-icon/192")).catch(() => undefined).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("sf-") && !n.startsWith("sf-static-" + CONFIG.version) && !n.startsWith("sf-images-" + CONFIG.version) && !n.startsWith("sf-pages-" + CONFIG.version)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title : CONFIG.storeName;
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === "string" ? data.body : "",
    icon: scopeUrl() + "/" + (data.icon || "app-icon/192"),
    badge: scopeUrl() + "/" + (data.badge || "app-icon/badge"),
    tag: typeof data.tag === "string" ? data.tag : undefined,
    data: { url: tagged(inStore(data.path), data.tag) },
    vibrate: [100, 50, 100],
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || inStore("/");
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if (ownsUrl(client.url) && "focus" in client) {
        await client.focus();
        if ("navigate" in client) await client.navigate(url);
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

const offlinePage = (hasHome) => '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You\'re offline - ' + esc(CONFIG.storeName) + '</title>'
  + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:' + CONFIG.bg + ';color:' + CONFIG.ink + ';text-align:center;padding:1rem}'
  + 'main{max-width:26rem}img{width:72px;height:72px;border-radius:16px}h1{font-size:1.5rem;margin:1rem 0 .5rem}p{line-height:1.5;margin:0 0 .5rem}'
  + '.actions{display:flex;flex-wrap:wrap;gap:.75rem;justify-content:center;margin-top:1.25rem}'
  + 'button,a{min-height:44px;padding:.75rem 1.25rem;border-radius:.5rem;font:inherit;font-weight:600;cursor:pointer;text-decoration:none;box-sizing:border-box}'
  + 'button{border:0;background:' + CONFIG.accent + ';color:' + CONFIG.onAccent + '}a{border:2px solid currentColor;color:inherit}'
  + 'button:focus-visible,a:focus-visible{outline:3px solid ' + CONFIG.ink + ';outline-offset:2px}</style></head>'
  + '<body><main><img src="' + scopeUrl() + '/app-icon/192" alt=""><h1>You\'re offline</h1><p>' + esc(CONFIG.storeName) + ' will be here as soon as you\'re back online.</p>'
  + (hasHome ? '<p>You can still look at the pages you visited recently.</p>' : '')
  + '<div class="actions"><button type="button" onclick="location.reload()">Try again</button>'
  + (hasHome ? '<a href="' + scopeUrl() + '/">Home page</a>' : '') + '</div></main></body></html>';

const savedCopyNote = '<div role="status" style="position:sticky;top:0;z-index:100;padding:.625rem 1rem;background:' + CONFIG.ink + ';color:' + CONFIG.bg + ';font:600 .875rem/1.4 system-ui,sans-serif;text-align:center">'
  + 'You\'re offline. This is a saved copy, so prices and stock may have changed.</div>';

async function page(event) {
  const req = event.request;
  const url = new URL(req.url);
  const keep = !PRIVATE_PAGE.test(url.pathname) && !url.searchParams.has("restore");
  // Notification and shortcut tags don't make a different page.
  ["utm_source", "utm_medium", "utm_campaign", "source"].forEach((k) => url.searchParams.delete(k));
  const key = url.toString();
  try {
    const res = await fetch(req);
    if (keep && res.ok && res.type === "basic" && (res.headers.get("content-type") || "").includes("text/html")) {
      const copy = res.clone();
      event.waitUntil(caches.open(PAGE_CACHE).then((c) => c.put(key, copy)).then(() => trim(PAGE_CACHE, MAX_PAGES)).catch(() => undefined));
    }
    return res;
  } catch (err) {
    const cache = await caches.open(PAGE_CACHE);
    const saved = keep ? await cache.match(key) : undefined;
    if (saved) {
      const html = (await saved.text()).replace(/<body([^>]*)>/, "<body$1>" + savedCopyNote);
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }
    const home = await cache.match(scopeUrl()) || await cache.match(scopeUrl() + "/");
    return new Response(offlinePage(Boolean(home)), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

async function cacheFirst(event, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  if (hit) return hit;
  const res = await fetch(event.request);
  if (res.ok) event.waitUntil(cache.put(event.request, res.clone()).then(() => trim(name, max)).catch(() => undefined));
  return res;
}

async function staleWhileRevalidate(event, name, max) {
  const cache = await caches.open(name);
  const hit = await cache.match(event.request);
  const fresh = fetch(event.request).then((res) => {
    if (res.ok) event.waitUntil(cache.put(event.request, res.clone()).then(() => trim(name, max)).catch(() => undefined));
    return res;
  });
  if (hit) {
    event.waitUntil(fresh.catch(() => undefined));
    return hit;
  }
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    if (ownsUrl(req.url)) event.respondWith(page(event));
    return;
  }
  // Built files have the version in their names, so a kept copy is always right (not so while developing).
  if (CONFIG.dev) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/sf-assets/")) return event.respondWith(cacheFirst(event, STATIC_CACHE, MAX_STATIC));
  // Product photos: show the kept copy straight away and refresh it in the background.
  if (url.pathname === "/_next/image") return event.respondWith(staleWhileRevalidate(event, IMAGE_CACHE, MAX_IMAGES));
});
`;

/** Only colour values go into the worker's CSS: anything else falls back to a safe default. */
const colour = (value: string | undefined, fallback: string) => (value && /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i.test(value.trim()) ? value.trim() : fallback);

function serviceWorker(config: WorkerConfig) {
  const settings = JSON.stringify({ ...config, version: CACHE_VERSION, dev: process.env.NODE_ENV !== "production" }).replace(/</g, "\\u003c");
  return `/* ${config.storeName.replace(/\*\//g, "")} app service worker */\nconst CONFIG = ${settings};\n${WORKER_BODY}`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return new Response("// Not found", { status: 404, headers: { "Content-Type": "application/javascript; charset=utf-8" } });

  const c = storefront.site.theme.colours;
  const body = serviceWorker({
    storeName: storefront.storeName,
    bg: colour(c.bg, "#f8fafc"),
    ink: colour(c.ink, "#0f172a"),
    accent: colour(c.accent, "#0f172a"),
    onAccent: colour(storefront.site.cssVariables["--on-accent"], "#ffffff"),
  });
  return new Response(body, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      // Lets /shop/<store>/sw.js control "/shop/<store>" (no trailing slash), which is where its pages live.
      "Service-Worker-Allowed": storeAppScope(storefront.basePath),
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
    },
  });
}
