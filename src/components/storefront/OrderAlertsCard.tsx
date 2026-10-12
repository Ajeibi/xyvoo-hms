"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Smartphone } from "lucide-react";
import { ALERT_KINDS, ALERT_LABELS, type AlertPrefs } from "@/lib/store/merchant-alert-prefs";
import { DashAlert, dashButton, DashCard, DashStatus, sendJson } from "./dashboard-ui";

type Loaded = { prefs: AlertPrefs; canManage: boolean; pushPublicKey: string | null; yourDevices: number; teamDevices: number; alertEmail: string | null };
type DeviceState = "checking" | "unsupported" | "blocked" | "off" | "on";

const SW_URL = "/merchant-alerts-sw.js";
const SW_SCOPE = "/storefront/";
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** Whether this browser can get alerts, and whether it already does. */
async function detectDeviceState(): Promise<DeviceState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  try {
    const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    return sub ? "on" : "off";
  } catch {
    return "off";
  }
}

/** "Get alerts on this device", for anyone on the team. */
export function DeviceAlertsCard({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [state, setState] = useState<DeviceState>("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/store/alerts?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setError("We couldn't load your alert settings. Please refresh the page."));
  }, [slug]);

  useEffect(() => {
    let cancelled = false;
    detectDeviceState().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    if (!data?.pushPublicKey) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.pushPublicKey) }));
      await sendJson("/api/store/alerts/devices", "POST", { slug, subscription: sub.toJSON(), test: true });
      setState("on");
      setStatus("Alerts are on for this device. We've sent a test notification.");
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "We couldn't turn on alerts for this device. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const sub = reg ? await reg.pushManager.getSubscription() : null;
      if (sub) {
        await sendJson("/api/store/alerts/devices", "DELETE", { slug, endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
      setStatus("Alerts are off for this device. You'll still get them by email if they're on.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashCard
      id="device-alerts"
      icon={Smartphone}
      title="Alerts on this device"
      description="Get a notification on this phone or computer within seconds of a new order, like a message from any app."
    >
      <div className="space-y-4">
        {state === "unsupported" ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
            This browser can&rsquo;t show alerts. On an iPhone, add this dashboard to your Home Screen first (Share, then Add to Home Screen), then open it from there.
          </p>
        ) : null}
        {state === "blocked" ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Notifications are blocked for this site. Allow them in your browser&rsquo;s site settings, then come back to this page.
          </p>
        ) : null}
        {data && !data.pushPublicKey && state !== "unsupported" ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">Alerts on devices aren&rsquo;t switched on yet. You&rsquo;ll still get them by email.</p>
        ) : null}
        {state === "on" ? (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">This device gets the shop&rsquo;s alerts.</p>
        ) : null}
        <div aria-live="polite">{status ? <DashStatus message={status} /> : null}</div>
        <DashAlert message={error} />
        {data?.pushPublicKey && (state === "off" || state === "on") ? (
          state === "on" ? (
            <button type="button" onClick={turnOff} disabled={busy} className={`${dashButton.secondary} ${ring}`}>
              {busy ? "Turning off…" : "Stop alerts on this device"}
            </button>
          ) : (
            <button type="button" onClick={turnOn} disabled={busy} className={`${dashButton.primary} ${ring}`}>
              <BellRing className="h-4 w-4" aria-hidden />
              {busy ? "Turning on…" : "Get alerts on this device"}
            </button>
          )
        ) : null}
        {data ? (
          <p className="text-xs text-slate-500">
            {data.teamDevices === 0 ? "No devices on your team get alerts yet." : `${data.teamDevices} ${data.teamDevices === 1 ? "device" : "devices"} on your team get alerts.`}
          </p>
        ) : null}
      </div>
    </DashCard>
  );
}

/** Which alerts the shop gets, by email and on devices. Owners and admins can change them. */
export function AlertPreferencesCard({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(() => {
    fetch(`/api/store/alerts?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: Loaded) => {
        setData(d);
        setPrefs(d.prefs);
      })
      .catch(() => setError("We couldn't load your alert settings. Please refresh the page."));
  }, [slug]);
  useEffect(load, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prefs) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const saved = await sendJson("/api/store/alerts", "PATCH", { slug, prefs });
      setPrefs(saved.prefs);
      setStatus("Saved. Your alerts are updated.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!data || !prefs) {
    return (
      <DashCard id="alert-prefs" icon={BellRing} title="Which alerts the shop gets">
        {error ? <DashAlert message={error} /> : <div aria-hidden className="h-24 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />}
      </DashCard>
    );
  }

  const set = (kind: (typeof ALERT_KINDS)[number], channel: "email" | "push", value: boolean) => {
    setPrefs({ ...prefs, [kind]: { ...prefs[kind], [channel]: value } });
    setStatus("");
  };

  return (
    <DashCard
      id="alert-prefs"
      icon={BellRing}
      title="Which alerts the shop gets"
      description={
        data.canManage
          ? data.alertEmail
            ? `Emails go to ${data.alertEmail} (change it in Store details). Device alerts go to everyone on the team who turned them on.`
            : "Emails go to the shop owner's email until you add a contact email in Store details. Device alerts go to everyone on the team who turned them on."
          : "The owner or an admin chooses these."
      }
    >
      <form onSubmit={save} className="space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Alerts by email and on devices</caption>
            <thead>
              <tr className="border-b border-slate-200 text-slate-600">
                <th scope="col" className="py-2 pr-4 font-medium">
                  Alert
                </th>
                <th scope="col" className="px-3 py-2 text-center font-medium">
                  Email
                </th>
                <th scope="col" className="px-3 py-2 text-center font-medium">
                  Devices
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ALERT_KINDS.map((kind) => (
                <tr key={kind}>
                  <th scope="row" className="py-3 pr-4 font-normal">
                    <span className="block font-medium text-slate-900">{ALERT_LABELS[kind].title}</span>
                    <span className="block text-slate-600">{ALERT_LABELS[kind].description}</span>
                  </th>
                  {(["email", "push"] as const).map((channel) => (
                    <td key={channel} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-xyvoo-blue"
                        checked={prefs[kind][channel]}
                        disabled={!data.canManage}
                        onChange={(e) => set(kind, channel, e.target.checked)}
                        aria-label={`${ALERT_LABELS[kind].title} by ${channel === "email" ? "email" : "device notification"}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div aria-live="polite">{status ? <DashStatus message={status} /> : null}</div>
        <DashAlert message={error} />
        {data.canManage ? (
          <button type="submit" disabled={busy} className={`${dashButton.primary} ${ring}`}>
            {busy ? "Saving…" : "Save alert settings"}
          </button>
        ) : null}
      </form>
    </DashCard>
  );
}
