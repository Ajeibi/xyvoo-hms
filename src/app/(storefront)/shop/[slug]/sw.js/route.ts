import { getStorefront } from "@/lib/store/site/storefront";
import { storeAppScope } from "@/lib/store/app";

/*
 * The store app's service worker. It does three things and nothing else:
 *   - shows push notifications sent by the store owner, like any phone app
 *   - opens the right page in the store when one is tapped
 *   - shows a friendly "you're offline" page instead of the browser's error
 * It caches nothing else, so customers always see current prices and stock.
 */
function serviceWorker(storeName: string) {
  const name = JSON.stringify(storeName);
  return `/* ${storeName.replace(/\*\//g, "")} app service worker */
const STORE_NAME = ${name};
const scopeUrl = () => self.registration.scope.replace(/\\/$/, "");
// On the platform domain the scope is "/shop/<store>" with no trailing slash (where the shop's pages live),
// which the browser also matches to "/shop/<store>-two/...". Pages of another shop are left alone.
const ownsUrl = (url) => { const base = scopeUrl(); return url === base || ["/", "?", "#"].some((c) => url.startsWith(base + c)); };
const inStore = (path) => scopeUrl() + (typeof path === "string" && /^\\/(?![\\/\\\\])/.test(path) ? path : "/");
// Tag the link so the store can see how many people opened each notification (counted only with their analytics consent).
const tagged = (url, tag) => url + (url.includes("?") ? "&" : "?") + "utm_source=notification&utm_medium=push"
  + (typeof tag === "string" ? "&utm_campaign=" + encodeURIComponent(tag.replace(/^store-notification-/, "")) : "");

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { body: event.data ? event.data.text() : "" }; }
  const title = typeof data.title === "string" && data.title ? data.title : STORE_NAME;
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

const OFFLINE_PAGE = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You\\'re offline</title>'
  + '<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;text-align:center;padding:1rem}button{margin-top:1rem;padding:.75rem 1.25rem;border:0;border-radius:.5rem;background:#0f172a;color:#fff;font:inherit;cursor:pointer}</style></head>'
  + '<body><main><h1>You\\'re offline</h1><p>' + STORE_NAME.replace(/[<>&]/g, "") + ' will be here when you\\'re back online.</p><button onclick="location.reload()">Try again</button></main></body></html>';

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || !ownsUrl(event.request.url)) return;
  event.respondWith(fetch(event.request).catch(() => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
`;
}

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) return new Response("// Not found", { status: 404, headers: { "Content-Type": "application/javascript; charset=utf-8" } });

  return new Response(serviceWorker(storefront.storeName), {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      // Lets /shop/<store>/sw.js control "/shop/<store>" (no trailing slash), which is where its pages live.
      "Service-Worker-Allowed": storeAppScope(storefront.basePath),
      "Content-Security-Policy": "default-src 'self'; script-src 'self'",
    },
  });
}
