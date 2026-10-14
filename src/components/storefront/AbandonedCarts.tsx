"use client";

import { useEffect, useState } from "react";
import { BellRing, HandCoins, Mail, MailCheck, MessageCircle, Phone, ShoppingCart } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashFilterChips, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, sendJson } from "./dashboard-ui";
import { MEANING } from "./meaning";

type FollowUp = "none" | "contacted" | "recovered" | "dismissed";

type Cart = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  items: { name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  currency: string;
  stage: "details" | "payment";
  followUp: FollowUp;
  followedUpAt: string | null;
  recoveredOrderId: string | null;
  lastActivityAt: string;
  remindersSent: number;
  lastReminderAt: string | null;
  whatsappHref: string | null;
  emailHref: string | null;
};

const FILTERS = [
  { key: "open", label: "To follow up" },
  { key: "contacted", label: "Contacted" },
  { key: "recovered", label: "Recovered" },
  { key: "all", label: "All" },
] as const;
type Filter = (typeof FILTERS)[number]["key"];

type Reminders = 0 | 1 | 2;

const REMINDER_CHOICES: { value: Reminders; label: string; detail: string }[] = [
  { value: 2, label: "Two reminders", detail: "An hour after they stop, and again the next day" },
  { value: 1, label: "One reminder", detail: "An hour after they stop" },
  { value: 0, label: "Off", detail: "You follow up by hand" },
];

const FOLLOW_UP_LABEL: Record<FollowUp, string> = { none: "Not contacted", contacted: "Contacted", recovered: "Recovered", dismissed: "Dismissed" };
const FOLLOW_UP_TONE: Record<FollowUp, "slate" | "blue" | "green"> = { none: "slate", contacted: "blue", recovered: "green", dismissed: "slate" };

const EMPTY_COPY: Record<Filter, { title: string; description: string }> = {
  open: {
    title: "Nothing to follow up right now",
    description: "When a shopper enters their details at checkout but doesn’t pay, they’ll appear here so you can send them a quick message.",
  },
  contacted: { title: "No one contacted yet", description: "Shoppers you message from the “To follow up” list will move here." },
  recovered: { title: "No recovered carts yet", description: "When a shopper you followed up comes back and pays, mark them as recovered and they’ll show here." },
  all: {
    title: "No abandoned carts yet",
    description: "Shoppers who start checkout but don’t pay will appear here. Details are kept for 4 weeks.",
  },
};

/** The WhatsApp brand green, dark enough for white text to pass contrast. */
const whatsappButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800";
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

const ago = (iso: string, now: number) => {
  const minutes = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

function CartsSkeleton() {
  const pulse = "animate-pulse rounded bg-slate-100 motion-reduce:animate-none";
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-28 rounded-2xl ${pulse}`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`h-9 w-24 rounded-full ${pulse}`} />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className={`h-4 w-40 max-w-full ${pulse}`} />
          <div className={`mt-2 h-3 w-56 max-w-full ${pulse}`} />
          <div className={`mt-4 h-10 w-36 rounded-xl ${pulse}`} />
        </div>
      ))}
    </div>
  );
}

/** Dashboard → Abandoned carts: shoppers who started checkout but didn't pay, to follow up by hand. */
export default function AbandonedCarts({ slug }: { slug: string }) {
  const [carts, setCarts] = useState<Cart[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());
  const [reminders, setReminders] = useState<Reminders>(2);
  const [savingReminders, setSavingReminders] = useState(false);

  useEffect(() => {
    fetch(`/api/store/abandoned-carts?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load abandoned carts.");
        setCarts(body.carts);
        if (body.reminders === 0 || body.reminders === 1 || body.reminders === 2) setReminders(body.reminders);
      })
      .catch(() => setError("We couldn't load abandoned carts. Please refresh the page."));
  }, [slug]);

  const update = async (id: string, followUp: FollowUp) => {
    setError("");
    const before = carts;
    setCarts((list) => list?.map((c) => (c.id === id ? { ...c, followUp, followedUpAt: new Date().toISOString() } : c)) ?? null);
    try {
      await sendJson("/api/store/abandoned-carts", "PATCH", { slug, id, followUp });
    } catch (e) {
      setCarts(before);
      setError((e as Error).message);
    }
  };

  const changeReminders = async (value: Reminders) => {
    if (value === reminders) return;
    const before = reminders;
    setError("");
    setReminders(value);
    setSavingReminders(true);
    try {
      await sendJson("/api/store/abandoned-carts", "PUT", { slug, reminders: value });
    } catch (e) {
      setReminders(before);
      setError((e as Error).message);
    } finally {
      setSavingReminders(false);
    }
  };

  if (!carts) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <>
        <p className="sr-only" role="status">
          Loading abandoned carts
        </p>
        <CartsSkeleton />
      </>
    );
  }

  const shown = carts.filter((c) => (filter === "all" ? true : filter === "open" ? c.followUp === "none" : c.followUp === filter));
  const open = carts.filter((c) => c.followUp === "none");
  const openValue = open.reduce((s, c) => s + c.subtotal, 0);
  const recoveredValue = carts.filter((c) => c.followUp === "recovered").reduce((s, c) => s + c.subtotal, 0);
  const currency = carts[0]?.currency ?? "NGN";
  const reminded = carts.filter((c) => c.remindersSent > 0);
  const recoveredByReminder = reminded.filter((c) => c.followUp === "recovered").length;
  const countFor = (key: Filter) => (key === "all" ? carts.length : key === "open" ? open.length : carts.filter((c) => c.followUp === key).length);

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="abandoned-carts"
        meaning="orders"
        art="basket"
        title="Win back shoppers who didn't finish"
        points={[
          "A checkout counts as abandoned 30 minutes after the shopper stops. We keep their details for 4 weeks.",
          "If they left an email address, we can send them a reminder automatically, with a button that puts their basket back.",
          "You can also message them on WhatsApp, by email or by phone. Keep it friendly and brief: they often just have a question about delivery or payment.",
          "Mark each one as contacted or recovered, so you can see what it's worth to you.",
        ]}
      />

      <DashCard
        id="cart-reminders"
        icon={BellRing}
        meaning="marketing"
        title="Automatic email reminders"
        description="We email shoppers who left their email address at checkout but didn't pay, so you don't have to remember to."
      >
        <fieldset disabled={savingReminders}>
          <legend className="sr-only">How many reminders to send</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {REMINDER_CHOICES.map((choice) => {
              const on = reminders === choice.value;
              return (
                <label
                  key={choice.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-xyvoo-blue ${
                    on ? MEANING.marketing.chipOn : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="cart-reminders"
                    value={choice.value}
                    checked={on}
                    onChange={() => changeReminders(choice.value)}
                    className="mt-0.5 h-4 w-4 accent-rose-600"
                  />
                  <span>
                    <span className="block font-semibold">{choice.label}</span>
                    <span className="block text-slate-700">{choice.detail}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className={`mt-4 rounded-xl p-4 text-sm text-slate-700 ${MEANING.marketing.tint}`}>
          <p className="font-semibold text-slate-900">What shoppers receive</p>
          <p className="mt-1">
            An email from your shop listing what was in their basket, with a <span className="font-medium">Finish your order</span>{" "}
            button that puts it back at
            today&rsquo;s prices. Replies come to your business email. Every email has a link to stop reminders.
          </p>
          <p className="mt-2 text-slate-600">
            We don&rsquo;t send one if they&rsquo;ve since bought from you, if you&rsquo;ve already marked them contacted or dismissed, or if the basket is more than 3
            days old.
          </p>
        </div>
        <p className="sr-only" role="status">
          {savingReminders ? "Saving" : ""}
        </p>
      </DashCard>

      <DashStatStrip label="Abandoned carts in figures" columns={4}>
        <DashStatTile label="To follow up" meaning="orders" icon={ShoppingCart} hint={`Worth ${formatShopCurrency(openValue, currency)}`} value={String(open.length)} />
        <DashStatTile label="Recovered" meaning="money" icon={HandCoins} hint="From shoppers who came back and paid" value={formatShopCurrency(recoveredValue, currency)} />
        <DashStatTile label="Contacted" meaning="customers" icon={MessageCircle} hint="Waiting to hear back" value={String(countFor("contacted"))} />
        <DashStatTile
          label="Reminded by email"
          meaning="marketing"
          icon={MailCheck}
          hint={reminded.length ? `${recoveredByReminder} came back and paid` : "Sent automatically"}
          value={String(reminded.length)}
        />
      </DashStatStrip>

      <DashFilterChips
        label="Show"
        meaning="orders"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((f) => ({ value: f.key, label: f.label, count: countFor(f.key) }))}
      />

      <DashAlert message={error} />

      {shown.length === 0 ? (
        <DashEmptyState art="basket" meaning="orders" title={EMPTY_COPY[filter].title} description={EMPTY_COPY[filter].description} />
      ) : (
        <ul className="space-y-4">
          {shown.map((c) => {
            const who = c.name || "the shopper";
            // The first way to reach them is the main action: WhatsApp if we have a number, otherwise email.
            const primary = c.whatsappHref ? "whatsapp" : c.emailHref ? "email" : null;
            return (
              <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="break-words text-base font-semibold text-slate-900">{c.name || "Shopper"}</h2>
                    {c.email || c.phone ? <p className="break-words text-sm text-slate-600">{[c.email, c.phone].filter(Boolean).join(" · ")}</p> : null}
                    <p className="mt-1 text-sm text-slate-500">
                      {c.stage === "payment" ? "Reached payment but didn’t pay" : "Left after entering their details"} · {ago(c.lastActivityAt, now)}
                    </p>
                    {c.remindersSent > 0 && c.lastReminderAt ? (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-rose-800">
                        <MailCheck className="h-4 w-4" aria-hidden />
                        {c.remindersSent === 1 ? "Email reminder sent" : "2 email reminders sent"} · {ago(c.lastReminderAt, now)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-slate-900">{formatShopCurrency(c.subtotal, c.currency)}</p>
                    <DashPill tone={FOLLOW_UP_TONE[c.followUp]}>{FOLLOW_UP_LABEL[c.followUp]}</DashPill>
                  </div>
                </div>

                <ul className="mt-3 space-y-0.5 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700" aria-label={`In ${who}’s basket`}>
                  {c.items.map((i, n) => (
                    <li key={`${i.name}-${n}`}>
                      {i.quantity} × {i.name} <span className="text-slate-500">({formatShopCurrency(i.unitPrice, c.currency)} each)</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {c.whatsappHref ? (
                      <a
                        href={c.whatsappHref}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => c.followUp === "none" && update(c.id, "contacted")}
                        className={`${primary === "whatsapp" ? whatsappButton : dashButton.secondary} ${focusRing}`}
                      >
                        <MessageCircle className="h-4 w-4" aria-hidden /> Message on WhatsApp <span className="sr-only">{who} (opens WhatsApp)</span>
                      </a>
                    ) : null}
                    {c.emailHref ? (
                      <a
                        href={c.emailHref}
                        onClick={() => c.followUp === "none" && update(c.id, "contacted")}
                        className={`${primary === "email" ? dashButton.primary : dashButton.secondary} ${focusRing}`}
                      >
                        <Mail className="h-4 w-4" aria-hidden /> Email <span className="sr-only">{who}</span>
                      </a>
                    ) : null}
                    {c.phone ? (
                      <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className={`${dashButton.secondary} ${focusRing}`}>
                        <Phone className="h-4 w-4" aria-hidden /> Call <span className="sr-only">{who}</span>
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {c.followUp === "none" ? (
                      <button type="button" onClick={() => update(c.id, "contacted")} className={`${dashButton.quiet} ${focusRing}`}>
                        Mark contacted<span className="sr-only">: {who}</span>
                      </button>
                    ) : null}
                    {c.followUp !== "recovered" ? (
                      <button type="button" onClick={() => update(c.id, "recovered")} className={`${dashButton.quiet} ${focusRing}`}>
                        Mark recovered<span className="sr-only">: {who}</span>
                      </button>
                    ) : null}
                    {c.followUp !== "dismissed" ? (
                      <button type="button" onClick={() => update(c.id, "dismissed")} className={`rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 ${focusRing}`}>
                        Dismiss<span className="sr-only">: {who}</span>
                      </button>
                    ) : (
                      <button type="button" onClick={() => update(c.id, "none")} className={`rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 ${focusRing}`}>
                        Restore<span className="sr-only">: {who}</span>
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
