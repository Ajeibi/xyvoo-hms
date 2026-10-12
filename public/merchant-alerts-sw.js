/*
 * XYVOO shop alerts. Registered from the store dashboard ("Get alerts on this
 * device") with scope /storefront/, so it never controls the marketing site
 * or a shop's own pages. It only shows the alerts the server sends (new
 * orders, low stock, failed payments) and opens the dashboard when one is
 * tapped. It caches nothing.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Only dashboard pages on this site can be opened from an alert.
const safeUrl = (path) => (typeof path === "string" && /^\/storefront\/[a-z0-9-]+(\/[^\s]*)?$/i.test(path) ? path : "/auth/login/storefront");

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(typeof data.title === "string" && data.title ? data.title : "XYVOO", {
      body: typeof data.body === "string" ? data.body : "",
      icon: "/images/xyvoo-icon-512.png",
      badge: "/images/xyvoo-icon-512.png",
      tag: typeof data.tag === "string" ? data.tag : undefined,
      data: { url: safeUrl(data.url) },
      requireInteraction: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/auth/login/storefront", self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin + "/storefront/") && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(url);
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
