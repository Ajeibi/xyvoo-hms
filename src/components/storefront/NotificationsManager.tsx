"use client";

import { useEffect, useState } from "react";
import { Bell, CircleHelp, Gift, History, PackageCheck, Send, Smartphone, Sparkles, Tag, TriangleAlert, Users } from "lucide-react";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, sendJson } from "./dashboard-ui";
import { MEANING, type Meaning } from "./meaning";

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

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";
const pulse = "animate-pulse rounded bg-slate-100 motion-reduce:animate-none";

function NotificationsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`h-10 w-10 rounded-xl ${pulse}`} />
            <div className="flex-1 space-y-2">
              <div className={`h-6 w-12 ${pulse}`} />
              <div className={`h-3 w-40 max-w-full ${pulse}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className={`h-5 w-40 ${pulse}`} />
        <div className={`mt-5 h-11 w-full rounded-xl ${pulse}`} />
        <div className={`mt-4 h-24 w-full rounded-xl ${pulse}`} />
      </div>
    </div>
  );
}

/** Ready-made starting points: one tap fills the title and message, which the shop then edits. */
const IDEAS: Array<{ label: string; icon: typeof Users; meaning: Meaning; title: string; body: string }> = [
  { label: "New arrivals", icon: Sparkles, meaning: "stock", title: "New in this week", body: "Fresh stock has just landed. Take a look before it sells out." },
  { label: "A sale", icon: Tag, meaning: "marketing", title: "Our sale is on", body: "Prices are down for a few days only. Treat yourself today." },
  { label: "Back in stock", icon: PackageCheck, meaning: "orders", title: "It's back in stock", body: "A customer favourite is available again. Order now while it lasts." },
  { label: "Say thank you", icon: Gift, meaning: "customers", title: "Thank you for shopping with us", body: "We're grateful for your support. Here's to many more orders together." },
];

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

  if (!state) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <>
        <p className="sr-only" role="status">
          Loading notifications
        </p>
        <NotificationsSkeleton />
      </>
    );
  }

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
      <DashSectionIntro
        id="notifications"
        meaning="marketing"
        art="bell"
        title="Reach customers on their phones"
        points={[
          "Your message pops up on their phone or computer, like a notification from any app.",
          "Only customers who said yes to notifications receive them, and they can turn them off at any time.",
          "Keep it short and useful: new stock, a sale or an important update.",
        ]}
      />

      <DashStatStrip label="Your notifications in figures" columns={3}>
        <DashStatTile label="Customers you can reach" meaning="customers" icon={Users} hint="People who turned on your notifications" value={String(state.subscribers)} />
        <DashStatTile label="Left to send today" meaning="marketing" icon={Bell} hint={`Up to ${state.limits.perDay} a day`} value={String(state.leftToday)} />
        <DashStatTile label="Sent so far" meaning="orders" icon={Send} hint="Shown in the list below" value={String(state.sent.length)} />
      </DashStatStrip>

      <DashCard
        id="notify-new"
        icon={Send}
        meaning="marketing"
        title="New notification"
        description="It pops up on customers’ phones and computers like a message from an app. Keep it short and useful: a new arrival, an offer or an important update."
      >
        {blocked ? (
          <p className="mb-5 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            <span>{blocked}</span>
          </p>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <form
            className="min-w-0 space-y-4"
            aria-labelledby="notify-new-title"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) setConfirming(true);
            }}
          >
            <div>
              <p className="mb-2 text-sm font-medium text-slate-800">Start from an idea</p>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Ideas for a notification">
                {IDEAS.map((idea) => (
                  <button
                    key={idea.label}
                    type="button"
                    disabled={Boolean(blocked)}
                    onClick={() => {
                      setTitle(idea.title.slice(0, state.limits.title));
                      setBody(idea.body.slice(0, state.limits.body));
                      setConfirming(false);
                    }}
                    className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium text-slate-800 transition-shadow hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50 ${MEANING[idea.meaning].tint} ${focusRing}`}
                  >
                    <idea.icon className={`h-4 w-4 ${MEANING[idea.meaning].icon}`} aria-hidden />
                    {idea.label}
                  </button>
                ))}
              </div>
            </div>
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
                  <button type="button" onClick={send} disabled={busy} className={`${dashButton.primary} ${focusRing}`}>
                    <Send className="h-4 w-4" aria-hidden /> {busy ? "Sending…" : "Yes, send it"}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={`${dashButton.secondary} ${focusRing}`}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="submit" disabled={!ready} className={`${dashButton.primary} ${focusRing}`}>
                <Send className="h-4 w-4" aria-hidden /> Send notification
              </button>
            )}
            {status ? <DashStatus message={status} /> : null}
            <DashAlert message={error} />
          </form>

          <div aria-label="Preview of the notification on a phone" role="group" className="min-w-0">
            <p className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-800">
              <Smartphone className="h-4 w-4 text-slate-500" aria-hidden /> Preview
            </p>
            <div className="rounded-[2rem] bg-gradient-to-br from-rose-200 via-sky-200 to-teal-200 p-4 pb-16 shadow-inner">
              <p aria-hidden className="mb-3 text-center font-heading text-3xl font-bold text-slate-800/80">
                9:41
              </p>
              <div className="rounded-2xl bg-white/95 p-3 shadow-lg">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  {/* eslint-disable-next-line @next/next/no-img-element -- the store's own generated app icon */}
                  <img src={`/shop/${slug}/app-icon/192`} alt="" width={20} height={20} className="h-5 w-5 rounded" />
                  <span className="truncate font-medium text-slate-800">{storeName}</span>
                  <span aria-hidden>·</span>
                  <span>now</span>
                </div>
                <p className="mt-1.5 break-words text-sm font-semibold text-slate-900">{title || "Your title"}</p>
                <p className="break-words text-sm text-slate-700">{body || "Your message appears here."}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">Phones show it slightly differently, but with your shop&rsquo;s name and icon.</p>
          </div>
        </div>
      </DashCard>

      <DashCard
        id="notify-history"
        icon={History}
        meaning="orders"
        title="Sent"
        description="Notifications you’ve sent, and how many customers they reached."
      >
        {state.sent.length ? (
          <ul className="-my-1 divide-y divide-slate-100">
            {state.sent.map((n) => (
              <li key={n.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="min-w-0 break-words font-medium text-slate-900">{n.title}</p>
                  <p className="text-slate-600">{when(n.createdAt)}</p>
                </div>
                <p className="break-words text-slate-700">{n.body}</p>
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  <DashPill tone={n.recipients && n.delivered === n.recipients ? "green" : "slate"}>
                    Delivered to {n.delivered} of {n.recipients}
                  </DashPill>
                  {n.failed ? <DashPill tone="amber">{n.failed} couldn&rsquo;t be reached</DashPill> : null}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <DashEmptyState
            art="bell"
            meaning="marketing"
            title="Nothing sent yet"
            description="Each notification you send will be listed here with how many customers received it. Write your first one above."
          />
        )}
      </DashCard>

      <DashCard
        id="notify-how"
        icon={CircleHelp}
        meaning="customers"
        title="How customers get your notifications"
        description="Only customers who choose to receive them do, so the more who say yes, the more people you can reach."
      >
        <ol className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          {[
            { tone: "marketing" as const, text: <>Your shop offers &ldquo;Get the app&rdquo; and &ldquo;Turn on notifications&rdquo; to visitors. Only people who say yes receive them.</> },
            { tone: "orders" as const, text: <>Android phones and computers: they can turn notifications on straight from your shop.</> },
            { tone: "stock" as const, text: <>iPhone and iPad: they add your shop to their home screen first (Share, then Add to Home Screen), then turn notifications on from the app.</> },
            { tone: "customers" as const, text: <>Customers can turn notifications off at any time.</> },
          ].map((step, i) => (
            <li key={i} className={`flex gap-3 rounded-xl p-4 ${MEANING[step.tone].tint}`}>
              <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-heading text-sm font-bold shadow-sm ${MEANING[step.tone].iconBox}`}>
                {i + 1}
              </span>
              <span>{step.text}</span>
            </li>
          ))}
        </ol>
      </DashCard>
    </div>
  );
}
