"use client";

import { useEffect, useState } from "react";
import { Eye, Mail, MessageCircle, ShoppingBasket, UserPlus } from "lucide-react";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashPill } from "./dashboard-ui";

type Shopper = {
  id: string;
  name: string | null;
  email: string;
  phone: string | null;
  contactConsent: boolean;
  source: "prompt" | "account_page" | "checkout";
  createdAt: string;
  lastSeenAt: string;
  basket: { name: string; quantity: number }[];
  basketTotal: string;
  viewed: { name: string; views: number }[];
  whatsappHref: string | null;
  emailHref: string | null;
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";
const whatsappButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800";

const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/** Customers → "Signed up, not bought yet": shopper accounts with no orders, so the shop can help them. */
export default function ShoppersNotBought({ slug }: { slug: string }) {
  const [shoppers, setShoppers] = useState<Shopper[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/store/customers/accounts?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load shopper accounts.");
        setShoppers(body.shoppers);
        setTotal(Number(body.total) || 0);
      })
      .catch(() => setError("We couldn't load shopper accounts. Please refresh the page."));
  }, [slug]);

  return (
    <DashCard
      id="shoppers-not-bought"
      icon={UserPlus}
      meaning="customers"
      title="Signed up, not bought yet"
      description={
        shoppers
          ? `${total} ${total === 1 ? "shopper has" : "shoppers have"} an account with your shop. These ${shoppers.length} haven't ordered yet. You can contact the ones who said yes.`
          : "Shoppers who created an account but haven't ordered yet."
      }
    >
      <DashAlert message={error} />
      {!shoppers ? (
        error ? null : (
          <p className="text-sm text-slate-600" role="status">
            Loading shopper accounts…
          </p>
        )
      ) : shoppers.length === 0 ? (
        <DashEmptyState
          art="people"
          meaning="customers"
          title="No one waiting"
          description="When shoppers create an account on your shop but haven't ordered yet, they'll appear here with what they looked at."
        />
      ) : (
        <ul className="space-y-3">
          {shoppers.map((s) => {
            const who = s.name || s.email;
            return (
              <li key={s.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="break-words font-semibold text-slate-900">{s.name || "Shopper"}</p>
                    <p className="break-words text-sm text-slate-600">{[s.email, s.phone].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Joined {when(s.createdAt)} · Last seen {when(s.lastSeenAt)}
                    </p>
                  </div>
                  {s.contactConsent ? <DashPill tone="green">Happy to hear from you</DashPill> : <DashPill tone="slate">Hasn’t agreed to contact</DashPill>}
                </div>

                {s.basket.length || s.viewed.length ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {s.basket.length ? (
                      <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-slate-700">
                        <p className="flex items-center gap-1.5 font-medium text-slate-900">
                          <ShoppingBasket className="h-4 w-4 text-sky-700" aria-hidden /> In their basket ({s.basketTotal})
                        </p>
                        <p>{s.basket.map((b) => `${b.quantity} × ${b.name}`).join(", ")}</p>
                      </div>
                    ) : null}
                    {s.viewed.length ? (
                      <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-slate-700">
                        <p className="flex items-center gap-1.5 font-medium text-slate-900">
                          <Eye className="h-4 w-4 text-amber-700" aria-hidden /> Looked at
                        </p>
                        <p>{s.viewed.map((v) => (v.views > 1 ? `${v.name} (${v.views} times)` : v.name)).join(", ")}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {s.whatsappHref || s.emailHref ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {s.whatsappHref ? (
                      <a href={s.whatsappHref} target="_blank" rel="noreferrer" className={`${whatsappButton} ${focusRing}`}>
                        <MessageCircle className="h-4 w-4" aria-hidden /> Message on WhatsApp <span className="sr-only">{who} (opens WhatsApp)</span>
                      </a>
                    ) : null}
                    {s.emailHref ? (
                      <a href={s.emailHref} className={`${s.whatsappHref ? dashButton.secondary : dashButton.primary} ${focusRing}`}>
                        <Mail className="h-4 w-4" aria-hidden /> Email <span className="sr-only">{who}</span>
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </DashCard>
  );
}
