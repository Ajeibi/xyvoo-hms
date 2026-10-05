"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleAlert, CreditCard } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";

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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const fee = billing ? `${Math.round(billing.feeRate * 10_000) / 100}%` : "";

  return (
    <section aria-labelledby="plan-title" className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <CreditCard className="mt-0.5 h-5 w-5 text-slate-500" aria-hidden />
        <div>
          <h2 id="plan-title" className="text-base font-semibold text-slate-900">
            Plan and fees
          </h2>
          {billing ? (
            <p className="mt-1 text-sm text-slate-600">
              {billing.summary} XYVOO&rsquo;s fee on your sales is currently <strong>{fee}</strong>.
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-500">Loading…</p>
          )}
        </div>
      </div>

      {error ? (
        <div role="alert" className="mt-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <p>{error}</p>
        </div>
      ) : null}

      {billing && billing.canManage ? (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {billing.canSubscribe ? (
            <button type="button" onClick={subscribe} disabled={busy} className="rounded-xl bg-xyvoo-blue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Opening Paystack…" : `Switch to Standard: ${formatShopCurrency(billing.standardPrice, billing.standardCurrency)} a month, 0% fees`}
            </button>
          ) : null}
          {!billing.billingAvailable && billing.plan !== "enterprise" ? (
            <p className="text-sm text-slate-600">Paying for Standard online isn&rsquo;t switched on yet.</p>
          ) : null}
          {billing.canCancel && !confirmCancel ? (
            <button type="button" onClick={() => setConfirmCancel(true)} className="text-sm font-medium text-slate-600 hover:text-red-700 hover:underline">
              Cancel Standard
            </button>
          ) : null}
          {confirmCancel ? (
            <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>Your plan won&rsquo;t renew. You keep 0% fees until the end of the month you&rsquo;ve paid for, then the Free plan&rsquo;s 4% applies.</p>
              <div className="mt-3 flex gap-3">
                <button type="button" onClick={cancel} disabled={busy} className="rounded-lg bg-red-700 px-4 py-2 font-semibold text-white disabled:opacity-60">
                  {busy ? "Cancelling…" : "Yes, cancel Standard"}
                </button>
                <button type="button" onClick={() => setConfirmCancel(false)} className="font-medium text-slate-700 hover:underline">
                  Keep Standard
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
