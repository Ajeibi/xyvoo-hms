"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Gift, HandCoins, Mail, Send, Settings2, Wallet, X } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import {
  DashAlert,
  dashButton,
  DashCard,
  DashEmptyState,
  DashField,
  dashInput,
  DashPill,
  DashSectionIntro,
  DashStatStrip,
  DashStatTile,
  DashStatus,
  sendJson,
} from "./dashboard-ui";

type Settings = { enabled: boolean; productId: string | null; expiryMonths: number | null; amounts: number[]; currency: string };
type Card = {
  id: string;
  code: string;
  initialAmount: number;
  balance: number;
  currency: string;
  status: "active" | "disabled";
  source: "purchase" | "issued";
  recipientName: string | null;
  recipientEmail: string | null;
  senderName: string | null;
  expiresAt: string | null;
  emailedAt: string | null;
  createdAt: string;
};
type Stats = { sold: number; soldCount: number; outstanding: number; spent: number };

const EXPIRY_CHOICES: { value: string; label: string }[] = [
  { value: "", label: "Never expire" },
  { value: "12", label: "12 months" },
  { value: "24", label: "2 years" },
  { value: "36", label: "3 years" },
];

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Dashboard → Gift cards: sell them in the shop, send one from the shop, and see every card and what's left on it. */
export default function GiftCardsManager({ slug }: { slug: string }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    fetch(`/api/store/gift-cards?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load your gift cards.");
        setSettings(body.settings);
        setCards(body.cards);
        setStats(body.stats);
      })
      .catch(() => setError("We couldn't load your gift cards. Please refresh the page."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!settings || !stats) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading gift cards…
      </p>
    );
  }
  const money = (n: number) => formatShopCurrency(n, settings.currency);

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="gift-cards"
        meaning="marketing"
        art="tag"
        title="Gift cards: presents that bring new customers"
        points={[
          "Shoppers buy a gift card in your shop and we email it to the person it's for, with their message.",
          "They spend it at checkout, in one go or over several orders. Whatever's left stays on the card.",
          "You can also send one yourself: a thank-you to a loyal customer, a prize or a way to put things right.",
        ]}
      />

      <DashStatStrip label="Gift cards in figures" columns={3}>
        <DashStatTile label="Sold" meaning="money" icon={HandCoins} hint={`${stats.soldCount} ${stats.soldCount === 1 ? "card" : "cards"} bought in your shop`} value={money(stats.sold)} />
        <DashStatTile label="Still to spend" meaning="marketing" icon={Wallet} hint="Left on cards that are switched on" value={money(stats.outstanding)} />
        <DashStatTile label="Spent so far" meaning="orders" icon={Gift} hint="Used at checkout, all cards" value={money(stats.spent)} />
      </DashStatStrip>

      <SettingsCard slug={slug} settings={settings} money={money} onSaved={setSettings} />
      <IssueCard slug={slug} currency={settings.currency} onIssued={load} />
      <CardsList slug={slug} cards={cards} money={money} onChanged={load} />
    </div>
  );
}

function SettingsCard({ slug, settings, money, onSaved }: { slug: string; settings: Settings; money: (n: number) => string; onSaved: (s: Settings) => void }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [amounts, setAmounts] = useState(settings.amounts);
  const [expiry, setExpiry] = useState(settings.expiryMonths ? String(settings.expiryMonths) : "");
  const [newAmount, setNewAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  const addAmount = () => {
    const n = Number(newAmount.replace(/[^0-9.]/g, ""));
    if (!n || n <= 0) return setError("Enter an amount, like 15000.");
    if (amounts.length >= 8) return setError("You can offer up to 8 amounts.");
    setError("");
    setAmounts([...new Set([...amounts, n])].sort((a, b) => a - b));
    setNewAmount("");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const data = await sendJson("/api/store/gift-cards", "PUT", { slug, enabled, amounts, expiryMonths: expiry ? Number(expiry) : null });
      onSaved(data.settings);
      setSaved(enabled ? "Saved. Gift cards are on sale in your shop." : "Saved. Gift cards aren't on sale in your shop.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashCard id="gift-card-settings" icon={Settings2} meaning="marketing" title="Selling gift cards" description="Choose the amounts shoppers can buy, and how long cards last.">
      <div className="space-y-5">
        <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${enabled ? "border-rose-300 bg-rose-50" : "border-slate-200 bg-white"}`}>
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-rose-600" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="text-sm">
            <span className="block font-semibold text-slate-900">Sell gift cards in my shop</span>
            <span className="block text-slate-700">A &ldquo;Gift card&rdquo; page appears in your shop. Cards are emailed as soon as payment is confirmed.</span>
          </span>
        </label>

        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-800">Amounts shoppers can choose</legend>
          <ul className="flex flex-wrap gap-2">
            {amounts.map((a) => (
              <li key={a} className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 py-1 pl-3 pr-1 text-sm font-medium text-rose-900">
                {money(a)}
                <button
                  type="button"
                  onClick={() => setAmounts(amounts.filter((x) => x !== a))}
                  disabled={amounts.length <= 1}
                  className={`rounded-full p-1 hover:bg-rose-100 disabled:opacity-40 ${focusRing}`}
                  aria-label={`Remove ${money(a)}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex max-w-sm gap-2">
            <label htmlFor="gc-new-amount" className="sr-only">
              Add an amount
            </label>
            <input
              id="gc-new-amount"
              className={dashInput}
              inputMode="decimal"
              placeholder="Add an amount, e.g. 15000"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addAmount();
                }
              }}
            />
            <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={addAmount}>
              Add
            </button>
          </div>
        </fieldset>

        <div className="max-w-xs">
          <DashField id="gc-expiry" label="Cards last" hint="Many shops choose 2 years. Cards that never expire are the friendliest for customers.">
            <select id="gc-expiry" className={dashInput} value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-describedby="gc-expiry-hint">
              {EXPIRY_CHOICES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </DashField>
        </div>

        <DashAlert message={error} />
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={`${dashButton.primary} ${focusRing}`} onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save gift card settings"}
          </button>
          {settings.enabled && settings.productId ? (
            <a href={`/shop/${encodeURIComponent(slug)}/products/${settings.productId}`} target="_blank" rel="noreferrer" className={`${dashButton.quiet} ${focusRing}`}>
              <ExternalLink className="h-4 w-4" aria-hidden /> See it in your shop<span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
          {saved ? <DashStatus message={saved} /> : null}
        </div>
      </div>
    </DashCard>
  );
}

function IssueCard({ slug, currency, onIssued }: { slug: string; currency: string; onIssued: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const get = (n: string) => String(form.get(n) ?? "").trim();
    const amount = Number(get("amount").replace(/[^0-9.]/g, ""));
    setBusy(true);
    setError("");
    setDone("");
    try {
      await sendJson("/api/store/gift-cards", "POST", { slug, amount, recipientName: get("name"), recipientEmail: get("email"), message: get("message") || undefined });
      formEl.reset();
      setDone(`Sent. ${get("name")} will get a ${formatShopCurrency(amount, currency)} gift card by email.`);
      onIssued();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashCard id="gift-card-issue" icon={Send} meaning="customers" title="Send a gift card" description="From you, free to them: a thank-you, a prize or a way to say sorry. They get it by email straight away.">
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
        <DashField id="gc-amount" label="Amount">
          <input id="gc-amount" name="amount" className={dashInput} inputMode="decimal" placeholder="e.g. 10000" />
        </DashField>
        <DashField id="gc-name" label="Their name">
          <input id="gc-name" name="name" className={dashInput} maxLength={120} autoComplete="off" />
        </DashField>
        <DashField id="gc-email" label="Their email address">
          <input id="gc-email" name="email" type="email" className={dashInput} maxLength={200} autoComplete="off" />
        </DashField>
        <DashField id="gc-message" label="Your message" optional>
          <input id="gc-message" name="message" className={dashInput} maxLength={300} placeholder="Thank you for being a wonderful customer" />
        </DashField>
        <div className="space-y-3 sm:col-span-2">
          <DashAlert message={error} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={`${dashButton.primary} ${focusRing}`} disabled={busy}>
              <Gift className="h-4 w-4" aria-hidden /> {busy ? "Sending…" : "Send gift card"}
            </button>
            {done ? <DashStatus message={done} /> : null}
          </div>
        </div>
      </form>
    </DashCard>
  );
}

function CardsList({ slug, cards, money, onChanged }: { slug: string; cards: Card[]; money: (n: number) => string; onChanged: () => void }) {
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const act = async (card: Card, action: "disable" | "enable" | "resend") => {
    setBusyId(card.id);
    setError("");
    setNote("");
    try {
      await sendJson("/api/store/gift-cards", "PATCH", { slug, id: card.id, action, label: card.recipientName || card.recipientEmail || card.code });
      setNote(action === "resend" ? `Sent again to ${card.recipientEmail}.` : action === "disable" ? "Card switched off. It can't be used until you switch it back on." : "Card switched on.");
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <DashCard id="gift-card-list" icon={Gift} meaning="orders" title="Every gift card" description="What's been sold or sent, and what's left on each card. Codes are private: only share one with the person it belongs to.">
      <DashAlert message={error} />
      {note ? <DashStatus message={note} /> : null}
      {cards.length === 0 ? (
        <DashEmptyState art="tag" meaning="marketing" title="No gift cards yet" description="Cards bought in your shop, and ones you send, will appear here." />
      ) : (
        <ul className="mt-2 space-y-3">
          {cards.map((c) => {
            const used = c.initialAmount - c.balance;
            const pct = Math.round((c.balance / c.initialAmount) * 100);
            const expired = c.expiresAt ? new Date(c.expiresAt).getTime() < now : false;
            return (
              <li key={c.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold tracking-wider text-slate-900">{c.code}</p>
                    <p className="mt-0.5 break-words text-sm text-slate-700">
                      For {c.recipientName || "someone"}
                      {c.recipientEmail ? ` (${c.recipientEmail})` : ""} · {c.source === "purchase" ? `bought by ${c.senderName || "a shopper"}` : "sent by you"} · {day(c.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {c.status === "disabled" ? <DashPill tone="slate">Switched off</DashPill> : expired ? <DashPill tone="amber">Expired</DashPill> : c.balance <= 0 ? <DashPill tone="slate">All spent</DashPill> : <DashPill tone="green">Active</DashPill>}
                    {!c.emailedAt && c.status === "active" ? <DashPill tone="amber">Email not sent yet</DashPill> : null}
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-slate-900">{money(c.balance)} left</span>
                    <span className="text-slate-600">
                      of {money(c.initialAmount)}
                      {used > 0 ? ` · ${money(used)} spent` : ""}
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                    <div className="h-full rounded-full bg-rose-500" style={{ width: `${pct}%` }} />
                  </div>
                  {c.expiresAt ? <p className="mt-1.5 text-xs text-slate-500">{expired ? "Expired" : "Expires"} {day(c.expiresAt)}</p> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {c.recipientEmail && c.status === "active" ? (
                    <button type="button" className={`${dashButton.quiet} ${focusRing}`} disabled={busyId === c.id} onClick={() => act(c, "resend")}>
                      <Mail className="h-4 w-4" aria-hidden /> Send the email again<span className="sr-only"> for {c.code}</span>
                    </button>
                  ) : null}
                  {c.status === "active" ? (
                    <button type="button" className={`${dashButton.danger} ${focusRing}`} disabled={busyId === c.id} onClick={() => act(c, "disable")}>
                      Switch off<span className="sr-only"> {c.code}</span>
                    </button>
                  ) : (
                    <button type="button" className={`${dashButton.quiet} ${focusRing}`} disabled={busyId === c.id} onClick={() => act(c, "enable")}>
                      Switch back on<span className="sr-only"> {c.code}</span>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
