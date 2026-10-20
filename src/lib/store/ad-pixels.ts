"use client";

/*
 * The shop owner's own Meta Pixel and Google Analytics 4 tag. Neither script is
 * loaded until the visitor accepts cookies in the shop's cookie banner (the
 * same choice as the shop's own analytics), and turning that choice down later
 * stops every event and removes the cookies they set. The ids sent with each
 * product are the product feed's ids (product-feed.ts), so Meta and Google can
 * match what was viewed or bought to the catalogue.
 */

export type PixelConfig = { metaPixelId: string | null; googleAnalyticsId: string | null; currency: string };

/** Pixel-only details an analytics event can carry. Never sent to XYVOO. */
export type PixelDetails = { itemIds?: string[]; itemName?: string };

type PixelEvent = PixelDetails & { type: string; quantity?: number; value?: number; searchTerm?: string };

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...args: unknown[]) => void; queue: unknown[]; loaded?: boolean; version?: string; push?: unknown; disablePushState?: boolean };
type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq; dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void };

let config: PixelConfig | null = null;
let loaded = false;
/** Orders from a thank-you page shown before the pixels were set up or accepted. */
let pendingPurchases: PurchaseOrder[] = [];

const META_ID = /^[0-9]{6,20}$/;
const GA_ID = /^G-[A-Z0-9]{4,12}$/;

export function configurePixels(next: PixelConfig) {
  config = {
    metaPixelId: next.metaPixelId && META_ID.test(next.metaPixelId) ? next.metaPixelId : null,
    googleAnalyticsId: next.googleAnalyticsId && GA_ID.test(next.googleAnalyticsId) ? next.googleAnalyticsId : null,
    currency: next.currency,
  };
}

export const pixelsConfigured = () => Boolean(config?.metaPixelId || config?.googleAnalyticsId);

/** Google's own off switch for a GA4 tag on this page. */
function setGoogleDisabled(id: string, disabled: boolean) {
  (window as unknown as Record<string, unknown>)[`ga-disable-${id}`] = disabled;
}

function addScript(src: string) {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

/** Loads the shop's pixels. Call only once the visitor has accepted cookies. Safe to call more than once. */
export function loadPixels() {
  if (loaded || !config || !pixelsConfigured()) return;
  loaded = true;
  const w = window as PixelWindow;
  // Accepted again after turning cookies down on this page.
  if (config.googleAnalyticsId) setGoogleDisabled(config.googleAnalyticsId, false);

  if (config.metaPixelId && !w.fbq) {
    // Meta's standard loader: queue calls until fbevents.js arrives.
    const fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    // Page views are sent by the shop on each page change, so Meta mustn't count them too.
    fbq.disablePushState = true;
    w.fbq = fbq;
    w._fbq = fbq;
    addScript("https://connect.facebook.net/en_US/fbevents.js");
    fbq("init", config.metaPixelId);
  }

  if (config.googleAnalyticsId && !w.gtag) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag.js reads the arguments object itself, not an array.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
    addScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.googleAnalyticsId)}`);
    w.gtag("js", new Date());
    // GA4 counts page views itself, including moves between pages of the shop.
    w.gtag("config", config.googleAnalyticsId);
  }

  pendingPurchases.splice(0).forEach(pixelPurchase);
}

/** Stops the pixels after the visitor turns cookies down, and removes the cookies they set. */
export function stopPixels() {
  loaded = false;
  pendingPurchases = [];
  if (config?.googleAnalyticsId) setGoogleDisabled(config.googleAnalyticsId, true);
  const host = window.location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim())) {
    if (name !== "_fbp" && name !== "_fbc" && name !== "_ga" && !name.startsWith("_ga_")) continue;
    for (const domain of domains) document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

function send(meta: [string, Record<string, unknown>] | null, google: [string, Record<string, unknown>] | null, eventId?: string) {
  if (!loaded || !config) return;
  const w = window as PixelWindow;
  if (meta && config.metaPixelId) w.fbq?.("track", meta[0], meta[1], eventId ? { eventID: eventId } : undefined);
  if (google && config.googleAnalyticsId) w.gtag?.("event", google[0], google[1]);
}

/** Passes a shop analytics event on to the pixels, in each one's own words. */
export function pixelEvent(event: PixelEvent) {
  if (!loaded || !config) return;
  const currency = config.currency;
  const ids = event.itemIds ?? [];
  const value = event.value != null ? round(event.value) : undefined;
  switch (event.type) {
    case "page_view":
      send(["PageView", {}], null);
      break;
    case "product_view":
      send(
        ["ViewContent", { content_ids: ids, content_type: "product", content_name: event.itemName, value, currency }],
        ["view_item", { currency, value, items: ids.slice(0, 1).map((id) => ({ item_id: id, item_name: event.itemName, price: value })) }],
      );
      break;
    case "search":
      send(["Search", { search_string: event.searchTerm }], ["search", { search_term: event.searchTerm }]);
      break;
    case "add_to_cart": {
      const quantity = event.quantity ?? 1;
      send(
        ["AddToCart", { content_ids: ids, content_type: "product", contents: ids.map((id) => ({ id, quantity })), value, currency }],
        ["add_to_cart", { currency, value, items: ids.map((id) => ({ item_id: id, quantity, price: value != null ? round(value / quantity) : undefined })) }],
      );
      break;
    }
    case "checkout_started":
      send(["InitiateCheckout", { value, currency }], ["begin_checkout", { value, currency }]);
      break;
    case "payment_started":
      send(["AddPaymentInfo", { value, currency }], ["add_payment_info", { value, currency }]);
      break;
  }
}

export type PurchaseLine = { itemId: string; name: string; quantity: number; unitPrice: number };
type PurchaseOrder = { id: string; total: number; lines: PurchaseLine[] };

/**
 * A completed order, sent once per order and browser. The order id goes with
 * it, so Meta and Google don't count a reloaded thank-you page twice.
 */
export function pixelPurchase(order: PurchaseOrder) {
  // Not loaded yet: hold it until the visitor accepts cookies (it's dropped if they never do).
  if (!loaded || !config) {
    if (pendingPurchases.length < 5 && !pendingPurchases.some((o) => o.id === order.id)) pendingPurchases.push(order);
    return;
  }
  const key = `sf-pixel-purchase:${order.id}`;
  try {
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, "1");
  } catch {
    /* without storage, the order id still lets Meta and Google drop repeats */
  }
  const currency = config.currency;
  const value = round(order.total);
  send(
    [
      "Purchase",
      {
        content_ids: order.lines.map((l) => l.itemId),
        content_type: "product",
        contents: order.lines.map((l) => ({ id: l.itemId, quantity: l.quantity, item_price: round(l.unitPrice) })),
        num_items: order.lines.reduce((n, l) => n + l.quantity, 0),
        value,
        currency,
      },
    ],
    [
      "purchase",
      { transaction_id: order.id, value, currency, items: order.lines.map((l) => ({ item_id: l.itemId, item_name: l.name, quantity: l.quantity, price: round(l.unitPrice) })) },
    ],
    order.id,
  );
}
