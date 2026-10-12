"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { DashAlert, dashButton, DashCard, DashPill } from "./dashboard-ui";

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

const PLAN_NAMES: Record<string, string> = { free: "Free plan", standard: "Standard plan", enterprise: "Enterprise plan" };

type Billing = {
  plan: "free" | "standard" | "enterprise";
  summary: string;
  feeRate: number;
  standardPrice: number;
  standardCurrency: string;
  canManage: boolean;
  canSubscribe: boolean;
  canCancel: boolean;
  billingAvailable: boolean;
};

/** Current plan and fee, with upgrade to Standard and cancel. */
export default function PlanBillingCard({ slug }: { slug: string }) {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/store/billing?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then(setBilling)
      .catch(() => setError("We couldn't load your plan. Please refresh the page."));
  }, [slug]);

  useEffect(load, [load]);

  const post = async (url: string) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
    return data;
  };

  const subscribe = async () => {
    setError("");
    setBusy(true);
    try {
      const { authorizationUrl } = await post("/api/store/billing/subscribe");
      window.location.href = authorizationUrl;
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const cancel = async () => {
    setError("");
    setBusy(true);
    try {
      await post("/api/store/billing/cancel");
      setConfirmCancel(false);
      load();
      window.dispatchEvent(new Event("xyvoo:payments-changed"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fee = billing ? `${Math.round(billing.feeRate * 10_000) / 100}%` : "";

  return (
    <DashCard
      id="plan"
      icon={CreditCard}
      meaning="money"
      title="Plan and fees"
      description="Your XYVOO plan, and what we charge on your sales."
      actions={billing ? <DashPill tone={billing.plan === "free" ? "slate" : "blue"}>{PLAN_NAMES[billing.plan] ?? billing.plan}</DashPill> : null}
    >
      {billing ? (
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {billing.summary} XYVOO&rsquo;s fee on your sales is currently <strong>{fee}</strong>.
        </p>
      ) : error ? null : (
        <div aria-hidden className="h-12 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
      )}

      {error ? (
        <div className="mt-4">
          <DashAlert message={error} />
        </div>
      ) : null}

      {billing && billing.canManage ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {billing.canSubscribe ? (
            <button type="button" onClick={subscribe} disabled={busy} className={`${dashButton.primary} ${ring} text-left`}>
              {busy ? "Opening Paystack…" : `Switch to Standard: ${formatShopCurrency(billing.standardPrice, billing.standardCurrency)} a month, 0% fees`}
            </button>
          ) : null}
          {!billing.billingAvailable && billing.plan !== "enterprise" ? (
            <p className="text-sm text-slate-600">Paying for Standard online isn&rsquo;t switched on yet.</p>
          ) : null}
          {billing.canCancel && !confirmCancel ? (
            <button type="button" onClick={() => setConfirmCancel(true)} className={`${dashButton.danger} ${ring}`}>
              Cancel Standard
            </button>
          ) : null}
          {confirmCancel ? (
            <div role="alert" className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <p className="font-medium">Cancel your Standard plan?</p>
              <p className="mt-1">Your plan won&rsquo;t renew. You keep 0% fees until the end of the month you&rsquo;ve paid for, then the Free plan&rsquo;s 4% applies.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={cancel}
                  disabled={busy}
                  className={`inline-flex items-center justify-center rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60 ${ring}`}
                >
                  {busy ? "Cancelling…" : "Yes, cancel Standard"}
                </button>
                <button type="button" onClick={() => setConfirmCancel(false)} className={`${dashButton.secondary} ${ring}`}>
                  Keep Standard
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </DashCard>
  );
}
