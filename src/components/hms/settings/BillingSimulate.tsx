"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HmsCard, hmsButton } from "@/components/hms/hms-ui";
import { toastError } from "@/lib/app-toast";

const OUTCOMES = [
  { outcome: "success", label: "Pay successfully", cls: hmsButton.primary },
  { outcome: "failed", label: "Decline the card", cls: hmsButton.secondary },
  { outcome: "abandoned", label: "Leave without paying", cls: hmsButton.secondary },
] as const;

/** The pretend Paystack page (development only): pick what happens, then go back to the return page. */
export function BillingSimulate({ slug, reference }: { slug: string; reference: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const choose = async (outcome: (typeof OUTCOMES)[number]["outcome"]) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/billing/charges/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reference, outcome }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not record that", data.error ?? "Try again.");
        return;
      }
      router.push(`/hms/${slug}/billing/return?reference=${encodeURIComponent(reference)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <HmsCard title="Pretend Paystack (development only)" description="No real money moves. Choose what the payer does.">
      <p className="mb-4 text-sm text-slate-600">
        Reference <span className="font-mono">{reference}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {OUTCOMES.map((o) => (
          <button key={o.outcome} type="button" className={o.cls} disabled={busy} onClick={() => void choose(o.outcome)}>
            {o.label}
          </button>
        ))}
      </div>
    </HmsCard>
  );
}
