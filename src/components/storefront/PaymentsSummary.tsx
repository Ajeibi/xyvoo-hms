"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Coins, CreditCard, Landmark, MessageCircle, Sparkles, Truck, Wallet } from "lucide-react";
import type { OfflinePayments } from "@/lib/store/offline-payments";
import type { CurrencySettings } from "@/lib/store/currencies";
import { DashAlert, DashCard, DashPill } from "./dashboard-ui";

type Tone = "slate" | "green" | "amber" | "red" | "blue";
type Row = { label: string; state: string; tone: Tone; href: string; icon: React.ComponentType<{ className?: string }>; iconBg: string };

type Snapshot = {
  payouts: { paymentsAvailable?: boolean; account?: unknown };
  offline: { settings?: OfflinePayments; whatsappNumber?: string | null };
  currencies: { homeCurrency?: string; settings?: CurrencySettings };
  billing: { plan?: string; feeRate?: number };
};

const PLAN_NAMES: Record<string, string> = { free: "Free plan", standard: "Standard plan", enterprise: "Enterprise plan" };

/** "a", "a or b", "a, b or c" */
const orList = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`);

/**
 * Payments → "How you get paid": what's switched on, at a glance, with a link to each card.
 * Reads the same endpoints the cards use, and refreshes when a card saves a change.
 */
export default function PaymentsSummary({ slug, hasOwnKeys }: { slug: string; hasOwnKeys: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const q = `?slug=${encodeURIComponent(slug)}`;
    const get = (url: string) => fetch(url + q).then((r) => r.json());
    const load = () =>
      Promise.all([get("/api/store/payouts"), get("/api/store/offline-payments"), get("/api/store/currencies"), get("/api/store/billing")])
        .then(([payouts, offline, currencies, billing]) => {
          if (cancelled) return;
          setSnapshot({ payouts, offline, currencies, billing });
          setError("");
        })
        .catch(() => {
          if (!cancelled) setError("We couldn't load this summary just now. Your settings are below.");
        });
    void load();
    window.addEventListener("xyvoo:payments-changed", load);
    return () => {
      cancelled = true;
      window.removeEventListener("xyvoo:payments-changed", load);
    };
  }, [slug]);

  if (error && !snapshot) return <DashAlert message={error} />;

  if (!snapshot) {
    return (
      <DashCard id="how-paid" icon={Wallet} meaning="money" title="How you get paid">
        <div aria-hidden className="space-y-3">
          <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
          ))}
        </div>
      </DashCard>
    );
  }

  const { payouts, offline, currencies, billing } = snapshot;
  const cardOn = Boolean(payouts.account);
  const bankOn = Boolean(offline.settings?.bankTransfer.enabled);
  const deliveryOn = Boolean(offline.settings?.payOnDelivery.enabled);
  const whatsappOn = Boolean(offline.settings?.whatsapp.enabled);
  const whatsappReady = whatsappOn && Boolean(offline.whatsappNumber);

  const ways = [cardOn && "by card", bankOn && "by bank transfer", deliveryOn && "on delivery", whatsappReady && "through WhatsApp"].filter(
    (x): x is string => Boolean(x),
  );

  const onOff = (on: boolean): Pick<Row, "state" | "tone"> => (on ? { state: "On", tone: "green" } : { state: "Off", tone: "slate" });

  const rows: Row[] = [
    {
      label: "Card payments",
      icon: CreditCard,
      iconBg: cardOn ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600",
      ...(cardOn
        ? { state: "Set up", tone: "green" as Tone }
        : hasOwnKeys
          ? { state: "Using your own Paystack keys", tone: "blue" as Tone }
          : payouts.paymentsAvailable
            ? { state: "Not set up yet", tone: "amber" as Tone }
            : { state: "Not available yet", tone: "slate" as Tone }),
      href: cardOn || !hasOwnKeys ? "#get-paid" : "#own-paystack-keys",
    },
    { label: "Bank transfer", icon: Landmark, iconBg: bankOn ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600", ...onOff(bankOn), href: "#other-ways-to-pay" },
    { label: "Pay on delivery", icon: Truck, iconBg: deliveryOn ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-600", ...onOff(deliveryOn), href: "#other-ways-to-pay" },
    {
      label: "Order on WhatsApp",
      icon: MessageCircle,
      iconBg: whatsappReady ? "bg-emerald-50 text-emerald-700" : whatsappOn ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600",
      ...(whatsappOn && !whatsappReady ? { state: "Needs your WhatsApp number", tone: "amber" as Tone } : onOff(whatsappOn)),
      href: "#other-ways-to-pay",
    },
  ];

  const home = currencies.homeCurrency;
  const extra = currencies.settings?.extra.map((c) => c.code) ?? [];
  if (home) {
    rows.push({
      label: "Currencies",
      icon: Coins,
      iconBg: extra.length ? "bg-teal-50 text-teal-700" : "bg-slate-100 text-slate-600",
      state: extra.length ? `${home}, also ${extra.join(", ")}` : `${home} only`,
      tone: extra.length ? ("blue" as Tone) : ("slate" as Tone),
      href: "#currencies",
    });
  }

  if (billing.plan) {
    const fee = typeof billing.feeRate === "number" ? `, ${Math.round(billing.feeRate * 10_000) / 100}% fee` : "";
    rows.push({
      label: "Plan",
      icon: Sparkles,
      iconBg: billing.plan === "free" ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700",
      state: `${PLAN_NAMES[billing.plan] ?? billing.plan}${fee}`,
      tone: billing.plan === "free" ? ("slate" as Tone) : ("green" as Tone),
      href: "#plan-and-fees",
    });
  }

  return (
    <DashCard
      id="how-paid"
      icon={Wallet}
      meaning="money"
      title="How you get paid"
      description={
        ways.length
          ? `Customers can pay ${orList(ways)}.`
          : "No ways to pay are switched on yet. Set up card payments or another way to pay below."
      }
      actions={ways.length ? <DashPill tone="green">{ways.length} active</DashPill> : <DashPill tone="amber">Setup needed</DashPill>}
    >
      <ul className="divide-y divide-slate-100/80">
        {rows.map((row) => (
          <li key={row.label}>
            <a
              href={row.href}
              className="group flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 rounded-xl px-2 py-3 text-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue"
            >
              <div className="flex items-center gap-3">
                <span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${row.iconBg}`}>
                  <row.icon className="h-4 w-4" />
                </span>
                <span className="font-medium text-slate-800 group-hover:text-slate-950 group-hover:underline">{row.label}</span>
              </div>
              <span className="flex items-center gap-2">
                <DashPill tone={row.tone}>{row.state}</DashPill>
                <ArrowRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </DashCard>
  );
}
