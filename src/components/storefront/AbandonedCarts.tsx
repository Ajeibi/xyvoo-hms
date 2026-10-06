"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle, Phone } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { DashAlert, sendJson } from "./dashboard-ui";

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

const FOLLOW_UP_LABEL: Record<FollowUp, string> = { none: "Not contacted", contacted: "Contacted", recovered: "Recovered", dismissed: "Dismissed" };

const ago = (iso: string, now: number) => {
  const minutes = Math.max(1, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

/** Dashboard → Abandoned carts: shoppers who started checkout but didn't pay, to follow up by hand. */
export default function AbandonedCarts({ slug }: { slug: string }) {
  const [carts, setCarts] = useState<Cart[] | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [error, setError] = useState("");
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetch(`/api/store/abandoned-carts?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => (ok ? setCarts(body.carts) : setError(typeof body.error === "string" ? body.error : "We couldn't load abandoned carts.")))
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

  if (!carts) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;

  const shown = carts.filter((c) =>
    filter === "all" ? true : filter === "open" ? c.followUp === "none" : c.followUp === filter,
  );
  const open = carts.filter((c) => c.followUp === "none");
  const openValue = open.reduce((s, c) => s + c.subtotal, 0);
  const recoveredValue = carts.filter((c) => c.followUp === "recovered").reduce((s, c) => s + c.subtotal, 0);
  const currency = carts[0]?.currency ?? "NGN";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">To follow up</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{open.length}</p>
          <p className="text-sm text-slate-600">worth {formatShopCurrency(openValue, currency)}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recovered</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatShopCurrency(recoveredValue, currency)}</p>
          <p className="text-sm text-slate-600">from customers who came back and paid</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          A checkout counts as abandoned 30 minutes after the shopper stops. Details are kept for 4 weeks. Be friendly and brief: a quick
          message often helps with a question about delivery or payment.
        </div>
      </div>

      <div role="group" aria-label="Show" className="inline-flex flex-wrap rounded-xl border border-slate-200 bg-white p-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-lg px-3 py-1.5 text-sm ${filter === f.key ? "bg-xyvoo-blue font-semibold text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <DashAlert message={error} />

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          {filter === "open" ? "Nothing to follow up right now." : "No carts here."}
        </p>
      ) : (
        <ul className="space-y-4">
          {shown.map((c) => (
            <li key={c.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{c.name || "Shopper"}</p>
                  <p className="text-sm text-slate-600">
                    {[c.email, c.phone].filter(Boolean).join(" · ")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {c.stage === "payment" ? "Reached payment but didn't pay" : "Left after entering their details"} · {ago(c.lastActivityAt, now)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold text-slate-900">{formatShopCurrency(c.subtotal, c.currency)}</p>
                  <p className={`text-xs font-medium ${c.followUp === "recovered" ? "text-emerald-700" : c.followUp === "contacted" ? "text-blue-700" : "text-slate-500"}`}>
                    {FOLLOW_UP_LABEL[c.followUp]}
                  </p>
                </div>
              </div>
              <ul className="mt-3 text-sm text-slate-700">
                {c.items.map((i, n) => (
                  <li key={`${i.name}-${n}`}>
                    {i.quantity} × {i.name} <span className="text-slate-500">({formatShopCurrency(i.unitPrice, c.currency)} each)</span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 flex flex-wrap gap-2">
                {c.whatsappHref ? (
                  <a href={c.whatsappHref} target="_blank" rel="noreferrer" onClick={() => c.followUp === "none" && update(c.id, "contacted")} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                    <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp <span className="sr-only">{c.name || "the shopper"} (opens WhatsApp)</span>
                  </a>
                ) : null}
                {c.emailHref ? (
                  <a href={c.emailHref} onClick={() => c.followUp === "none" && update(c.id, "contacted")} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                    <Mail className="h-4 w-4" aria-hidden /> Email <span className="sr-only">{c.name || "the shopper"}</span>
                  </a>
                ) : null}
                {c.phone ? (
                  <a href={`tel:${c.phone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
                    <Phone className="h-4 w-4" aria-hidden /> Call <span className="sr-only">{c.name || "the shopper"}</span>
                  </a>
                ) : null}
                {c.followUp !== "recovered" ? (
                  <button type="button" onClick={() => update(c.id, "recovered")} className="rounded-lg px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
                    Mark recovered
                  </button>
                ) : null}
                {c.followUp === "none" ? (
                  <button type="button" onClick={() => update(c.id, "contacted")} className="rounded-lg px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50">
                    Mark contacted
                  </button>
                ) : null}
                {c.followUp !== "dismissed" ? (
                  <button type="button" onClick={() => update(c.id, "dismissed")} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    Dismiss
                  </button>
                ) : (
                  <button type="button" onClick={() => update(c.id, "none")} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
                    Restore
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
