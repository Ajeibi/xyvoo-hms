"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, CircleAlert, Loader2 } from "lucide-react";
import { HmsCard, hmsButton } from "@/components/hms/hms-ui";
import { formatKobo } from "@/lib/hms/billing/money";
import type { PublicCharge } from "@/lib/hms/billing/types";

type View = { state: "checking" } | { state: "paid" | "pending" | "failed" | "mismatch" | "expired" | "refunded"; charge: PublicCharge } | { state: "error"; message: string };

const OUTCOME_STATES = ["paid", "pending", "failed", "mismatch", "expired", "refunded"] as const;

/** Where Paystack (or the pretend gateway) sends the payer back: asks the server what happened and says so plainly. */
export function BillingReturn({ slug, reference }: { slug: string; reference: string }) {
  const [view, setView] = useState<View>(reference ? { state: "checking" } : { state: "error", message: "This page needs a payment reference. Open it from the link Paystack sent you back to." });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    const check = async (left: number) => {
      try {
        const res = await fetch("/api/hotel/billing/charges/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, reference }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) return setView({ state: "error", message: data.error ?? "We couldn't check this payment. Please try again." });
        const state = (OUTCOME_STATES as readonly string[]).includes(data.outcome) ? (data.outcome as (typeof OUTCOME_STATES)[number]) : "pending";
        // Paystack can take a few seconds to confirm a transfer: look again before saying "waiting".
        if (state === "pending" && left > 0) {
          setTimeout(() => void check(left - 1), 3000);
          return;
        }
        setView({ state, charge: data.charge });
      } catch {
        if (!cancelled) setView({ state: "error", message: "We couldn't check this payment. Please try again." });
      }
    };
    void check(3);
    return () => {
      cancelled = true;
    };
  }, [slug, reference, attempt]);

  const back = (
    <Link href={`/hms/${slug}/settings#platform-payments-title`} className={hmsButton.primary}>
      Back to settings
    </Link>
  );

  if (view.state === "checking") {
    return (
      <HmsCard>
        <p className="flex items-center gap-2 text-sm text-slate-700" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Checking your payment with Paystack…
        </p>
      </HmsCard>
    );
  }
  if (view.state === "error") {
    return (
      <HmsCard>
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden />
          <div className="space-y-3">
            <p className="text-sm text-slate-800">{view.message}</p>
            <div className="flex gap-2">
              {reference ? (
                <button type="button" className={hmsButton.secondary} onClick={() => { setView({ state: "checking" }); setAttempt((n) => n + 1); }}>
                  Check again
                </button>
              ) : null}
              {back}
            </div>
          </div>
        </div>
      </HmsCard>
    );
  }

  const { charge } = view;
  const amount = formatKobo(charge.amountKobo, charge.currency);
  const ref = <span className="font-mono">{charge.reference}</span>;
  const copy: Record<typeof view.state, { title: string; body: React.ReactNode; ok: boolean }> = {
    paid: {
      ok: true,
      title: "Payment received. Thank you!",
      body: (
        <>
          We received {amount} for {charge.description}. A receipt is on its way to your email. Your reference is {ref}.
          {charge.needsAttention ? " We haven&apos;t finished setting this up yet; your payment is safe, and you can press Try again in settings." : ""}
        </>
      ),
    },
    pending: {
      ok: false,
      title: "We haven't received your payment yet",
      body: <>If you paid by bank transfer it can take a few minutes. Nothing has been charged twice. Your reference is {ref}.</>,
    },
    failed: { ok: false, title: "The payment didn't go through", body: <>You haven't been charged for this attempt, or the money will go back to you. You can start again from settings. Reference {ref}.</> },
    mismatch: {
      ok: false,
      title: "We need to look at this payment",
      body: <>The amount Paystack received didn&apos;t match what we expected, so we haven&apos;t completed your order. Please contact us and quote {ref}; we&apos;ll sort it out.</>,
    },
    expired: { ok: false, title: "This payment link has expired", body: <>Please start again from settings. Reference {ref}.</> },
    refunded: { ok: false, title: "This payment was refunded", body: <>The money has gone back to you. Reference {ref}.</> },
  };
  const c = copy[view.state];

  return (
    <HmsCard>
      <div className="flex items-start gap-3">
        {c.ok ? <CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" aria-hidden /> : <CircleAlert className="mt-0.5 h-6 w-6 text-amber-600" aria-hidden />}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-slate-900">{c.title}</h2>
          <p className="text-sm text-slate-700">{c.body}</p>
          <div className="flex gap-2">
            {view.state === "pending" ? (
              <button type="button" className={hmsButton.secondary} onClick={() => { setView({ state: "checking" }); setAttempt((n) => n + 1); }}>
                Check again
              </button>
            ) : null}
            {back}
          </div>
        </div>
      </div>
    </HmsCard>
  );
}
