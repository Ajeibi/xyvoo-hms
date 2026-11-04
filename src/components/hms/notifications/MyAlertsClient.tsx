"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Mail, MessageCircle, Smartphone } from "lucide-react";
import { HmsCard, HmsWarning, hmsButton } from "@/components/hms/hms-ui";
import { DeliveryLog } from "@/components/hms/notifications/DeliveryLog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { AlertChoices } from "@/lib/hms/notification-preferences";
import type { NotificationUserSettings } from "@/lib/hms/notification-settings";

type Group = { key: keyof AlertChoices; label: string; hint: string };
type Loaded = {
  groups: Group[];
  allGroups?: Group[];
  choices: AlertChoices;
  settings: NotificationUserSettings;
  canSetDefaults: boolean;
  hotelDefaults: AlertChoices | null;
  email: string | null;
  devices: number;
  pushPublicKey: string | null;
  whatsappLive: boolean;
};
type Channel = "in_app" | "email" | "whatsapp" | "push";

const CHANNELS: { key: Channel; label: string }[] = [
  { key: "in_app", label: "In the app" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "push", label: "Push" },
];

const SW_URL = "/hms-alerts-sw.js";
const SW_SCOPE = "/hms/";
const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const check = "h-5 w-5 rounded border-slate-300 text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

function urlBase64ToUint8Array(base64: string) {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function ChoiceGrid({
  groups,
  value,
  onChange,
  idPrefix,
}: {
  groups: Group[];
  value: AlertChoices;
  onChange: (next: AlertChoices) => void;
  idPrefix: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-slate-600">
            <th scope="col" className="py-2 pr-4 font-medium">What it covers</th>
            {CHANNELS.map((c) => (
              <th key={c.key} scope="col" className="px-2 py-2 text-center font-medium">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.key} className="border-b border-slate-100 last:border-0">
              <th scope="row" className="py-3 pr-4 font-normal">
                <span className="block font-medium text-slate-900">{g.label}</span>
                <span className="block text-xs text-slate-600">{g.hint}</span>
              </th>
              {CHANNELS.map((c) => {
                const id = `${idPrefix}-${g.key}-${c.key}`;
                return (
                  <td key={c.key} className="px-2 py-3 text-center">
                    <input
                      id={id}
                      type="checkbox"
                      className={check}
                      aria-label={`${g.label}: ${c.label}`}
                      checked={value[g.key][c.key]}
                      onChange={(e) => onChange({ ...value, [g.key]: { ...value[g.key], [c.key]: e.target.checked } })}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MyAlertsClient({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [choices, setChoices] = useState<AlertChoices | null>(null);
  const [settings, setSettings] = useState<NotificationUserSettings | null>(null);
  const [defaults, setDefaults] = useState<AlertChoices | null>(null);
  const [saving, setSaving] = useState(false);
  const [device, setDevice] = useState<"checking" | "unsupported" | "blocked" | "off" | "on">("checking");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hotel/notifications/preferences?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) {
      setError("We couldn't load your alert settings. Refresh the page to try again.");
      return;
    }
    const json = (await res.json()) as Loaded;
    setData(json);
    setChoices(json.choices);
    setSettings(json.settings);
    setDefaults(json.hotelDefaults);
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let next: typeof device = "off";
      if (!pushSupported()) next = "unsupported";
      else if (Notification.permission === "denied") next = "blocked";
      else {
        try {
          const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
          next = (await reg?.pushManager.getSubscription()) ? "on" : "off";
        } catch {
          next = "off";
        }
      }
      if (!cancelled) setDevice(next);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async (scope: "me" | "hotel") => {
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          scope === "me" ? { slug, scope, choices, settings } : { slug, scope, choices: defaults },
        ),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Not saved", json.error ?? "Try again.");
        return;
      }
      toastSuccess(scope === "me" ? "Your alerts are saved" : "Hotel defaults saved");
      void load();
    } finally {
      setSaving(false);
    }
  };

  const turnOnDevice = async () => {
    if (!data?.pushPublicKey) return;
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? (await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" }));
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(data.pushPublicKey) }));
      const res = await fetch("/api/hotel/notifications/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error("save failed");
      setDevice("on");
      toastSuccess("This device will get your alerts", "Choose Push for the alerts you want on it.");
      void load();
    } catch {
      toastError("Could not switch this device on", "Check that notifications are allowed for this site, then try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOffDevice = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(SW_SCOPE);
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/hotel/notifications/devices", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setDevice("off");
      void load();
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async (channel: "email" | "whatsapp" | "push") => {
    setTesting(channel);
    try {
      const res = await fetch("/api/hotel/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, channel }),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; detail?: string };
      if (json.status === "sent") toastSuccess("Test sent", json.detail);
      else toastError(json.status === "skipped" ? "Test not sent" : "Test failed", json.detail ?? "Try again.");
    } finally {
      setTesting(null);
    }
  };

  if (error) return <HmsWarning>{error}</HmsWarning>;
  if (!data || !choices || !settings) return <p className="text-sm text-slate-600" role="status">Loading your alert settings…</p>;

  const patch = (p: Partial<NotificationUserSettings>) => setSettings({ ...settings, ...p });

  return (
    <div className="space-y-6">
      <HmsCard id="my-alerts" title="Which alerts reach you" description="Choose how you hear about each kind of alert. Urgent alerts always show in the app." icon={BellRing}>
        <ChoiceGrid groups={data.groups} value={choices} onChange={setChoices} idPrefix="me" />
      </HmsCard>

      <HmsCard id="contact" title="Where we reach you" description="Email goes to the address you sign in with." icon={Mail}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="alerts-email" className="mb-1 block text-sm font-medium text-slate-800">Email</label>
            <input id="alerts-email" className={`${input} bg-slate-50`} value={data.email ?? ""} readOnly />
            <button type="button" className={`${hmsButton.small} mt-2`} disabled={testing !== null} onClick={() => sendTest("email")}>
              {testing === "email" ? "Sending…" : "Send me a test email"}
            </button>
          </div>
          <div>
            <label htmlFor="alerts-whatsapp" className="mb-1 block text-sm font-medium text-slate-800">WhatsApp number</label>
            <input
              id="alerts-whatsapp"
              className={input}
              inputMode="tel"
              placeholder="+2348012345678"
              value={settings.whatsappNumber ? `+${settings.whatsappNumber}` : ""}
              onChange={(e) => patch({ whatsappNumber: e.target.value.replace(/^\+/, "") || null })}
              aria-describedby="alerts-whatsapp-hint"
            />
            <p id="alerts-whatsapp-hint" className="mt-1 text-xs text-slate-600">With the country code. Save before sending a test.</p>
            {!data.whatsappLive ? (
              <p className="mt-1 text-xs text-amber-800">WhatsApp isn&apos;t live for this hotel yet, so messages are logged but not sent.</p>
            ) : null}
            <button type="button" className={`${hmsButton.small} mt-2`} disabled={testing !== null} onClick={() => sendTest("whatsapp")}>
              {testing === "whatsapp" ? "Sending…" : "Send me a test WhatsApp"}
            </button>
          </div>
        </div>
      </HmsCard>

      <HmsCard id="push" title="Alerts on this phone or computer" description="Push alerts appear even when XYVOO is closed." icon={Smartphone}>
        {data.pushPublicKey === null ? (
          <HmsWarning>Push isn&apos;t set up on this server yet.</HmsWarning>
        ) : device === "unsupported" ? (
          <p className="text-sm text-slate-700">This browser can&apos;t receive push alerts. On an iPhone, add XYVOO to your home screen first.</p>
        ) : device === "blocked" ? (
          <p className="text-sm text-slate-700">Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then come back.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {device === "on" ? (
              <>
                <span className="text-sm font-medium text-green-800">This device is on.</span>
                <button type="button" className={hmsButton.secondary} disabled={busy} onClick={turnOffDevice}>Turn off</button>
                <button type="button" className={hmsButton.secondary} disabled={testing !== null} onClick={() => sendTest("push")}>
                  {testing === "push" ? "Sending…" : "Send me a test"}
                </button>
              </>
            ) : (
              <button type="button" className={hmsButton.primary} disabled={busy || device === "checking"} onClick={turnOnDevice}>
                {busy ? "Switching on…" : "Get alerts on this device"}
              </button>
            )}
            <span className="text-sm text-slate-600">{data.devices} device{data.devices === 1 ? "" : "s"} on your account.</span>
          </div>
        )}
      </HmsCard>

      <HmsCard id="quiet" title="Quiet hours" description="Email, WhatsApp and push wait until quiet hours end. Hotel time." icon={MessageCircle}>
        <div className="space-y-4">
          <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
            <input type="checkbox" className={check} checked={settings.quietEnabled} onChange={(e) => patch({ quietEnabled: e.target.checked })} />
            Hold my alerts during quiet hours
          </label>
          {settings.quietEnabled ? (
            <div className="grid grid-cols-1 max-w-md gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="quiet-start" className="mb-1 block text-sm font-medium text-slate-800">From</label>
                <input id="quiet-start" type="time" className={input} value={settings.quietStart} onChange={(e) => patch({ quietStart: e.target.value })} />
              </div>
              <div>
                <label htmlFor="quiet-end" className="mb-1 block text-sm font-medium text-slate-800">Until</label>
                <input id="quiet-end" type="time" className={input} value={settings.quietEnd} onChange={(e) => patch({ quietEnd: e.target.value })} />
              </div>
              <label className="flex items-center gap-3 text-sm text-slate-800 sm:col-span-2">
                <input type="checkbox" className={check} checked={settings.quietAllowCritical} onChange={(e) => patch({ quietAllowCritical: e.target.checked })} />
                Still send urgent alerts
              </label>
            </div>
          ) : null}
        </div>
      </HmsCard>

      {data.canSetDefaults ? (
        <HmsCard id="summary" title="Daily summary email" description="A morning email with today's arrivals and departures, who is in house, occupancy and what needs attention." icon={Mail}>
          <div className="space-y-4">
            <label className="flex items-center gap-3 text-sm font-medium text-slate-800">
              <input type="checkbox" className={check} checked={settings.dailySummary} onChange={(e) => patch({ dailySummary: e.target.checked })} />
              Email me the daily summary
            </label>
            {settings.dailySummary ? (
              <div className="max-w-xs">
                <label htmlFor="summary-hour" className="mb-1 block text-sm font-medium text-slate-800">Send it at (hotel time)</label>
                <select id="summary-hour" className={input} value={settings.summaryHour} onChange={(e) => patch({ summaryHour: Number(e.target.value) })}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </HmsCard>
      ) : null}

      <div>
        <button type="button" className={hmsButton.primary} disabled={saving} onClick={() => save("me")}>
          {saving ? "Saving…" : "Save my alerts"}
        </button>
      </div>

      {data.canSetDefaults && defaults ? (
        <HmsCard id="hotel-defaults" title="Hotel defaults" description="What new team members get, and anyone who hasn't chosen for themselves. Each person can change theirs above." icon={BellRing}>
          <ChoiceGrid groups={data.allGroups ?? data.groups} value={defaults} onChange={setDefaults} idPrefix="hotel" />
          <div className="mt-4">
            <button type="button" className={hmsButton.secondary} disabled={saving} onClick={() => save("hotel")}>Save hotel defaults</button>
          </div>
        </HmsCard>
      ) : null}

      {data.canSetDefaults ? <DeliveryLog slug={slug} /> : null}
    </div>
  );
}
