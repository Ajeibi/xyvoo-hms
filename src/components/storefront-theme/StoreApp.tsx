"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { getConsent, track } from "@/lib/store/analytics-client";

/*
 * "Get the app" and "Turn on notifications" for a store, shown to shoppers.
 *
 * - Android and desktop Chrome/Edge: the browser's own install prompt.
 * - iPhone and iPad: Apple has no install button, so we explain "Share, then
 *   Add to Home Screen". Notifications only work on iOS once installed.
 * - Notifications are only requested after the shopper taps the button.
 */

export type StoreAppConfig = {
  slug: string;
  storeName: string;
  swUrl: string;
  scope: string;
  pushPublicKey: string | null;
};

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

type ClientEnv = { ready: boolean; ios: boolean; standalone: boolean; canPush: boolean };

const SERVER_ENV: ClientEnv = { ready: false, ios: false, standalone: false, canPush: false };
let clientEnv: ClientEnv | null = null;

function readClientEnv(): ClientEnv {
  if (clientEnv) return clientEnv;
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const canPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && (!ios || standalone);
  clientEnv = { ready: true, ios, standalone, canPush };
  return clientEnv;
}

const noopSubscribe = () => () => {};
const useClientEnv = () => useSyncExternalStore(noopSubscribe, readClientEnv, () => SERVER_ENV);

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const DISMISS_KEY = (slug: string) => `sf-app-prompt-dismissed:${slug}`;
const DISMISS_DAYS = 30;

function wasDismissed(slug: string) {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY(slug)));
    return Boolean(at) && Date.now() - at < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

type PushState = "unknown" | "off" | "on" | "blocked" | "working";

export default function StoreApp({ config, variant }: { config: StoreAppConfig; variant: "prompt" | "footer" }) {
  const env = useClientEnv();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [push, setPush] = useState<PushState>("unknown");
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  const [visible, setVisible] = useState(false);
  const [message, setMessage] = useState("");

  // Register the store's service worker, and find out whether this browser is already subscribed.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(config.swUrl, { scope: config.scope, updateViaCache: "none" })
      .then((reg) => (reg.pushManager ? reg.pushManager.getSubscription() : null))
      .then((sub) => setPush(typeof Notification !== "undefined" && Notification.permission === "denied" ? "blocked" : sub ? "on" : "off"))
      .catch(() => setPush("off"));
  }, [config.swUrl, config.scope]);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      track({ type: "app_installed" });
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // The floating prompt waits a few seconds, so it never competes with the page loading.
  useEffect(() => {
    if (variant !== "prompt") return;
    const timer = window.setTimeout(() => {
      // Never on top of the cookie banner: wait for a visit where the visitor has already chosen.
      setDismissed(wasDismissed(config.slug) || getConsent(config.slug) === null);
      setVisible(true);
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [variant, config.slug]);

  const install = useCallback(async () => {
    if (installEvent) {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setInstallEvent(null);
    } else if (env.ios) {
      setShowIosHelp((s) => !s);
    }
  }, [installEvent, env.ios]);

  const turnOnNotifications = useCallback(async () => {
    if (!config.pushPublicKey) return;
    setPush("working");
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPush(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.pushPublicKey) }));
      const res = await fetch(`/api/shop/${encodeURIComponent(config.slug)}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("save failed");
      setPush("on");
      setMessage(`Notifications are on. ${config.storeName} will let you know about offers and new stock.`);
    } catch {
      setPush("off");
      setMessage("We couldn't turn on notifications. Please try again.");
    }
  }, [config.pushPublicKey, config.slug, config.storeName]);

  const turnOffNotifications = useCallback(async () => {
    setPush("working");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(`/api/shop/${encodeURIComponent(config.slug)}/push`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPush("off");
      setMessage("Notifications are off.");
    } catch {
      setPush("on");
    }
  }, [config.slug]);

  if (!env.ready) return null;

  const canInstall = !env.standalone && !installed && (Boolean(installEvent) || env.ios);
  const canAskPush = env.canPush && Boolean(config.pushPublicKey) && (push === "off" || push === "working");

  const iosHelp = showIosHelp ? (
    <ol className="store-app__steps" id={`ios-help-${variant}`}>
      <li>
        Tap the <strong>Share</strong> button at the bottom of Safari (a square with an arrow).
      </li>
      <li>
        Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
      </li>
      <li>Open {config.storeName} from your home screen to turn on notifications.</li>
    </ol>
  ) : null;

  const installButton = canInstall ? (
    <button type="button" className="btn btn--primary btn--sm" onClick={install} aria-expanded={env.ios && !installEvent ? showIosHelp : undefined} aria-controls={env.ios && !installEvent ? `ios-help-${variant}` : undefined}>
      Get the app
    </button>
  ) : null;

  const pushButton = canAskPush ? (
    <button type="button" className="btn btn--outline btn--sm" onClick={turnOnNotifications} disabled={push === "working"}>
      {push === "working" ? "Turning on…" : "Turn on notifications"}
    </button>
  ) : null;

  if (variant === "footer") {
    // Only with something to do here: install the app, or turn this shop's notifications on or off
    // (a browser that can take notifications isn't enough when the shop can't send them).
    if (!canInstall && !(env.canPush && config.pushPublicKey)) return null;
    return (
      <div className="store-app store-app--footer">
        <h2 className="store-app__title">Get the {config.storeName} app</h2>
        <p>Shop faster from your home screen and hear about offers first.</p>
        <div className="store-app__actions">
          {installButton}
          {pushButton}
          {push === "on" ? (
            <button type="button" className="btn btn--outline btn--sm" onClick={turnOffNotifications}>
              Turn off notifications
            </button>
          ) : null}
        </div>
        {push === "blocked" ? <p className="store-app__note">Notifications are blocked for this shop in your browser settings.</p> : null}
        {env.ios && !env.standalone ? <p className="store-app__note">On iPhone, add the app to your home screen first to get notifications.</p> : null}
        {iosHelp}
        <p className="store-app__note" role="status">
          {message}
        </p>
      </div>
    );
  }

  // Floating prompt: once, a few seconds in, and only when there's something to offer.
  if (!visible || dismissed || (!canInstall && !canAskPush)) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY(config.slug), String(Date.now()));
    } catch {
      /* private browsing: just hide it for now */
    }
    setDismissed(true);
  };
  return (
    <aside className="store-app store-app--prompt" aria-label={`Get the ${config.storeName} app`}>
      <p className="store-app__title">{canInstall ? `Get the ${config.storeName} app` : `Hear from ${config.storeName} first`}</p>
      <p>{canInstall ? "Add it to your home screen for quicker shopping." : "Get a notification about offers and new stock. You can turn it off any time."}</p>
      <div className="store-app__actions">
        {installButton ?? pushButton}
        <button type="button" className="store-app__dismiss" onClick={dismiss}>
          Not now
        </button>
      </div>
      {iosHelp}
      <p className="store-app__note" role="status">
        {message}
      </p>
    </aside>
  );
}
