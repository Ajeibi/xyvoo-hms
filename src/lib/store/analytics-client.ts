"use client";

/*
 * Browser side of store analytics. Nothing is stored or sent until the visitor
 * accepts analytics cookies in the store's cookie banner. Events are queued
 * and sent in small batches with navigator.sendBeacon, so tracking never slows
 * the page down.
 */

import type { StoreEventType } from "./analytics";

export type ConsentChoice = "accepted" | "rejected";

type TrackedEvent = { type: StoreEventType; path?: string; productId?: string; quantity?: number; value?: number; searchTerm?: string };

let slug: string | null = null;
let queue: TrackedEvent[] = [];
const early: TrackedEvent[] = [];
let timer: number | null = null;
const listeners = new Set<() => void>();

const consentKey = (s: string) => `sf-consent:${s}`;
const visitorKey = (s: string) => `sf-vid:${s}`;
const sessionKey = (s: string) => `sf-sid:${s}`;
const campaignKey = (s: string) => `sf-src:${s}`;

function storage(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function randomId() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function getConsent(storeSlug: string): ConsentChoice | null {
  const value = storage("local")?.getItem(consentKey(storeSlug));
  return value === "accepted" || value === "rejected" ? value : null;
}

/** Saves the visitor's choice. Rejecting removes any analytics ids already stored. */
export function setConsent(storeSlug: string, choice: ConsentChoice) {
  const local = storage("local");
  local?.setItem(consentKey(storeSlug), choice);
  if (choice === "rejected") {
    local?.removeItem(visitorKey(storeSlug));
    storage("session")?.removeItem(sessionKey(storeSlug));
    storage("session")?.removeItem(campaignKey(storeSlug));
    queue = [];
  }
  listeners.forEach((l) => l());
}

export function onConsentChange(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Opens the cookie banner again (from the footer's "Cookie settings" link). */
export function reopenCookieSettings() {
  window.dispatchEvent(new CustomEvent("sf:cookie-settings"));
}

function ids(storeSlug: string) {
  const local = storage("local");
  const session = storage("session");
  let visitorId = local?.getItem(visitorKey(storeSlug)) || "";
  if (!visitorId) {
    visitorId = randomId();
    local?.setItem(visitorKey(storeSlug), visitorId);
  }
  let sessionId = session?.getItem(sessionKey(storeSlug)) || "";
  if (!sessionId) {
    sessionId = randomId();
    session?.setItem(sessionKey(storeSlug), sessionId);
  }
  return { visitorId, sessionId };
}

/** Where this visit came from: read once per session from the landing page's link. */
function campaign(storeSlug: string) {
  const session = storage("session");
  const saved = session?.getItem(campaignKey(storeSlug));
  if (saved) {
    try {
      return JSON.parse(saved) as { referrer?: string; utm: { source?: string; medium?: string; campaign?: string } };
    } catch {
      /* fall through and read it again */
    }
  }
  const params = new URLSearchParams(window.location.search);
  const value = {
    referrer: document.referrer || undefined,
    utm: {
      source: params.get("utm_source") || (params.get("source") === "app" ? "app" : undefined) || undefined,
      medium: params.get("utm_medium") || undefined,
      campaign: params.get("utm_campaign") || undefined,
    },
  };
  session?.setItem(campaignKey(storeSlug), JSON.stringify(value));
  return value;
}

const isApp = () => window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function flush() {
  if (timer !== null) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (!slug || !queue.length || getConsent(slug) !== "accepted") return;
  const events = queue.splice(0, 25);
  const source = campaign(slug);
  const body = JSON.stringify({ ...ids(slug), isApp: isApp(), referrer: source.referrer, utm: source.utm, events });
  const url = `/api/shop/${encodeURIComponent(slug)}/events`;
  const sent = typeof navigator.sendBeacon === "function" && navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
  if (!sent) fetch(url, { method: "POST", body, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(() => undefined);
  if (queue.length) flush();
}

/** Set up tracking for a store page. Safe to call more than once. */
export function initStoreAnalytics(storeSlug: string) {
  if (slug === storeSlug) return;
  slug = storeSlug;
  early.splice(0).forEach(track);
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
}

/** Record something the visitor did. Does nothing without analytics consent. */
export function track(event: TrackedEvent) {
  const withPath = { ...event, path: event.path ?? window.location.pathname.slice(0, 300) };
  // Components on the page can mount before the tracker is set up: hold their events until it is.
  if (!slug) {
    if (early.length < 25) early.push(withPath);
    return;
  }
  if (getConsent(slug) !== "accepted") return;
  queue.push(withPath);
  if (queue.length >= 10) flush();
  else if (timer === null) timer = window.setTimeout(flush, 4000);
}

/** A stable id for this checkout, shared by the abandoned-cart save and the order. */
export function checkoutToken(storeSlug: string) {
  const session = storage("session");
  const key = `sf-checkout:${storeSlug}`;
  let token = session?.getItem(key) || "";
  if (!token) {
    token = randomId();
    session?.setItem(key, token);
  }
  return token;
}

export function clearCheckoutToken(storeSlug: string) {
  storage("session")?.removeItem(`sf-checkout:${storeSlug}`);
}

/** The analytics session id, if the visitor consented (links a checkout to where they came from). */
export function analyticsSessionId(storeSlug: string) {
  return getConsent(storeSlug) === "accepted" ? ids(storeSlug).sessionId : undefined;
}
