"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatKobo } from "@/lib/hms/billing/money";
import type { ChargeStatus, PublicCharge } from "@/lib/hms/billing/types";

const STATUS: Record<ChargeStatus, { label: string; tone: "slate" | "green" | "amber" | "red" }> = {
  paid: { label: "Paid", tone: "green" },
  pending: { label: "Waiting for payment", tone: "amber" },
  failed: { label: "Didn't go through", tone: "red" },
  expired: { label: "Expired", tone: "slate" },
  refunded: { label: "Refunded", tone: "slate" },
};

const date = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** What the hotel has paid XYVOO (a custom domain, ...). Owner/admin only; guest payments are not here. */
export function PlatformChargesCard({ slug, charges, canTryPayment }: { slug: string; charges: PublicCharge[]; canTryPayment: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const start = async () => {
    setBusy("start");
    try {
      const res = await fetch("/api/hotel/billing/charges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, kind: "test_charge" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.authorizationUrl) {
        toastError("Could not start the payment", data.error ?? "Try again.");
        return;
      }
      window.location.assign(data.authorizationUrl);
    } finally {
      setBusy(null);
    }
  };

  const retry = async (reference: string) => {
    setBusy(reference);
    try {
      const res = await fetch("/api/hotel/billing/charges/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reference }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) toastError("Could not try again", data.error ?? "Try again in a moment.");
      else if (data.charge?.needsAttention) toastError("Still not finished", "Your payment is safe. We'll keep this on your list; please contact us if it stays like this.");
      else toastSuccess("All done.");
      router.refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <HmsCard
      id="platform-payments"
      title="Payments to XYVOO"
      description="What your hotel has paid XYVOO, for example a custom domain. Guest payments are not shown here."
      icon={Receipt}
      meaning="money"
      actions={
        <SettingsSectionInfo
          title="Payments to XYVOO"
          text="These are payments from your hotel to XYVOO, paid by card or bank transfer through Paystack. Each one has a reference you can quote if you ever need help, and a receipt is emailed to whoever paid. Only an owner or admin can see this list."
        />
      }
    >
      {charges.length === 0 ? (
        <HmsEmptyState bare icon={Receipt} meaning="money" title="No payments yet" description="When you buy something from XYVOO, such as a custom domain, it will appear here." />
      ) : (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {charges.map((c) => {
            const s = STATUS[c.status];
            return (
              <div key={c.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{c.description}</p>
                  <p className="mt-0.5 text-xs text-slate-600">
                    {date(c.paidAt ?? c.createdAt)} · Ref <span className="font-mono">{c.reference}</span>
                  </p>
                  {c.needsAttention ? (
                    <p className="mt-1 text-xs text-amber-800">Your payment went through, but we haven&apos;t finished setting this up yet. Press Try again.</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold tabular-nums text-slate-900">{formatKobo(c.amountKobo, c.currency)}</span>
                  <HmsPill tone={s.tone}>{s.label}</HmsPill>
                  {c.needsAttention ? (
                    <button type="button" className={hmsButton.secondary} disabled={busy === c.reference} onClick={() => void retry(c.reference)}>
                      Try again
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {canTryPayment ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 p-3 text-sm text-slate-600">
          <span>Development only: try the payment flow with a ₦100 test charge.</span>
          <button type="button" className={hmsButton.secondary} disabled={busy === "start"} onClick={() => void start()}>
            Pay ₦100 test charge
          </button>
        </div>
      ) : null}
    </HmsCard>
  );
}
