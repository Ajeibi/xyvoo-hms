"use client";

import { useEffect, useState } from "react";
import { Bell, Smartphone, Users } from "lucide-react";
import { DashAlert, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

type Sent = { id: string; title: string; body: string; path: string; recipients: number; delivered: number; failed: number; createdAt: string };

type NotificationsState = {
  configured: boolean;
  live: boolean;
  canSend: boolean;
  subscribers: number;
  sent: Sent[];
  leftToday: number;
  limits: { perDay: number; title: number; body: number };
  links: { label: string; path: string }[];
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** Dashboard → Notifications: send a push notification to customers who installed the shop's app or allowed notifications. */
export default function NotificationsManager({ slug, storeName }: { slug: string; storeName: string }) {
  const [state, setState] = useState<NotificationsState | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [path, setPath] = useState("/");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = () =>
    fetch(`/api/store/notifications?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, data: await res.json().catch(() => ({})) }))
      .then(({ ok, data }) => (ok ? setState(data) : setError(typeof data.error === "string" ? data.error : "We couldn't load notifications.")))
      .catch(() => setError("We couldn't load notifications. Please refresh the page."));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once per store
  }, [slug]);

  if (!state) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;

  const blocked = !state.configured
    ? "Notifications aren't switched on for XYVOO yet. We'll let you know when you can send them."
    : !state.live
      ? "Publish your shop first. Customers can only install your app and turn on notifications once your shop is live."
      : !state.canSend
        ? "Only the shop's owner or an admin can send notifications."
        : state.leftToday === 0
          ? `You've sent ${state.limits.perDay} notifications in the last 24 hours. You can send another tomorrow.`
          : "";
  const ready = !blocked && title.trim() && body.trim();

  const send = async () => {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await sendJson("/api/store/notifications", "POST", { slug, title, body, path });
      setStatus(
        result.recipients === 0
          ? "Sent. Nobody has turned on notifications yet, so no one received it."
          : `Sent to ${result.delivered} of ${result.recipients} ${result.recipients === 1 ? "customer" : "customers"}.`,
      );
      setTitle("");
      setBody("");
      setPath("/");
      setConfirming(false);
      await load();
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <Users className="h-5 w-5 text-slate-500" aria-hidden />
          <div>
            <p className="text-2xl font-semibold text-slate-900">{state.subscribers}</p>
            <p className="text-sm text-slate-600">{state.subscribers === 1 ? "customer gets" : "customers get"} your notifications</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5">
          <Bell className="h-5 w-5 text-slate-500" aria-hidden />
          <div>
            <p className="text-2xl font-semibold text-slate-900">{state.leftToday}</p>
            <p className="text-sm text-slate-600">left to send today (up to {state.limits.perDay} a day)</p>
          </div>
        </div>
      </div>

      <section aria-labelledby="notify-new" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="notify-new" className="text-base font-semibold text-slate-900">
          New notification
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          It pops up on customers&rsquo; phones and computers like a message from an app. Keep it short and useful: a new arrival, an offer or an
          important update.
        </p>

        {blocked ? (
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">{blocked}</p>
        ) : null}

        <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_20rem]">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) setConfirming(true);
            }}
          >
            <DashField id="notify-title" label="Title" hint={`${title.length} of ${state.limits.title} characters`}>
              <input
                id="notify-title"
                className={dashInput}
                value={title}
                maxLength={state.limits.title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setConfirming(false);
                }}
                placeholder="New stock just landed"
                aria-describedby="notify-title-hint"
                disabled={Boolean(blocked)}
              />
            </DashField>
            <DashField id="notify-body" label="Message" hint={`${body.length} of ${state.limits.body} characters`}>
              <textarea
                id="notify-body"
                className={`${dashInput} min-h-24`}
                value={body}
                maxLength={state.limits.body}
                onChange={(e) => {
                  setBody(e.target.value);
                  setConfirming(false);
                }}
                placeholder="Our shea butter cream is back in stock. Order today for delivery this week."
                aria-describedby="notify-body-hint"
                disabled={Boolean(blocked)}
              />
            </DashField>
            <DashField id="notify-link" label="When they tap it, open" hint="A page in your shop.">
              <select id="notify-link" className={dashInput} value={path} onChange={(e) => setPath(e.target.value)} aria-describedby="notify-link-hint" disabled={Boolean(blocked)}>
                {state.links.map((l) => (
                  <option key={l.path} value={l.path}>
                    {l.label}
                  </option>
                ))}
              </select>
            </DashField>

            {confirming ? (
              <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <p>
                  Send this to {state.subscribers} {state.subscribers === 1 ? "customer" : "customers"} now? It can&rsquo;t be taken back.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={send} disabled={busy} className="rounded-lg bg-xyvoo-blue px-4 py-2 font-semibold text-white disabled:opacity-50">
                    {busy ? "Sending…" : "Yes, send it"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="rounded-lg px-4 py-2 font-medium text-slate-700 hover:bg-white">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" disabled={!ready} className="rounded-lg bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                Send notification
              </button>
            )}
            {status ? <DashStatus message={status} /> : null}
            <DashAlert message={error} />
          </form>

          <div aria-label="Preview of the notification on a phone" role="group">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Smartphone className="h-4 w-4" aria-hidden /> Preview
            </p>
            <div className="rounded-3xl bg-slate-800 p-3">
              <div className="rounded-2xl bg-white/95 p-3 shadow">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the store's own generated app icon */}
                  <img src={`/shop/${slug}/app-icon/192`} alt="" width={20} height={20} className="h-5 w-5 rounded" />
                  <span className="font-medium text-slate-700">{storeName}</span>
                  <span aria-hidden>·</span>
                  <span>now</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold text-slate-900">{title || "Your title"}</p>
                <p className="text-sm text-slate-700">{body || "Your message appears here."}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Phones show it slightly differently, but with your shop&rsquo;s name and icon.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="notify-how" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="notify-how" className="text-base font-semibold text-slate-900">
          How customers get your notifications
        </h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
          <li>Your shop offers &ldquo;Get the app&rdquo; and &ldquo;Turn on notifications&rdquo; to visitors. Only people who say yes receive them.</li>
          <li>Android phones and computers: they can turn notifications on straight from your shop.</li>
          <li>iPhone and iPad: they add your shop to their home screen first (Share, then Add to Home Screen), then turn notifications on from the app.</li>
          <li>Customers can turn notifications off at any time.</li>
        </ul>
      </section>

      {state.sent.length ? (
        <section aria-labelledby="notify-history" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="notify-history" className="text-base font-semibold text-slate-900">
            Sent
          </h2>
          <ul className="mt-3 divide-y divide-slate-100">
            {state.sent.map((n) => (
              <li key={n.id} className="py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-medium text-slate-900">{n.title}</p>
                  <p className="text-slate-500">{when(n.createdAt)}</p>
                </div>
                <p className="text-slate-700">{n.body}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Delivered to {n.delivered} of {n.recipients}
                  {n.failed ? ` · ${n.failed} couldn't be reached` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
