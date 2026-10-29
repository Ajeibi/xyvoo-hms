"use client";

/*
 * The shop app's notifications from the shopper's side, shared by "Turn on
 * notifications" (StoreApp), order updates and back-in-stock requests.
 * Notifications are only ever requested after the shopper taps a button.
 */

export type StorePushConfig = { swUrl: string; scope: string; pushPublicKey: string | null };

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Whether this browser can take this shop's notifications (on iPhone, only once the app is on the home screen). */
export function canUsePush(config: StorePushConfig | null | undefined): config is StorePushConfig & { pushPublicKey: string } {
  if (!config?.pushPublicKey || typeof window === "undefined") return false;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && (!ios || standalone);
}

/** This device's subscription to the shop, if it already has one. Never asks for anything. */
export async function currentPushSubscription(config: StorePushConfig | null | undefined): Promise<PushSubscription | null> {
  if (!canUsePush(config) || Notification.permission !== "granted") return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration(config.scope);
    return (await reg?.pushManager.getSubscription()) ?? null;
  } catch {
    return null;
  }
}

/**
 * Asks for permission (the shopper has just tapped a button), subscribes and
 * saves the device. `marketing` false: only the updates they're asking for now.
 * Returns the subscription, or why not.
 */
export async function subscribeToShopPush(slug: string, config: StorePushConfig, marketing: boolean): Promise<PushSubscription | "blocked" | "failed"> {
  if (!canUsePush(config)) return "failed";
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return permission === "denied" ? "blocked" : "failed";
    const reg = (await navigator.serviceWorker.getRegistration(config.scope)) ?? (await navigator.serviceWorker.register(config.swUrl, { scope: config.scope, updateViaCache: "none" }));
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.pushPublicKey) }));
    const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), marketing }),
    });
    return res.ok ? sub : "failed";
  } catch {
    return "failed";
  }
}

/** Ties this device to an order or the basket being checked out. Quietly does nothing if it can't. */
export async function linkPush(slug: string, body: { kind: "order"; endpoint: string; orderId: string } | { kind: "checkout"; endpoint: string; token: string }) {
  try {
    const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/push/link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}
