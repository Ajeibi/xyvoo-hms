"use client";

import { useId, useState } from "react";
import { Gauge } from "lucide-react";
import { HmsAlert, HmsCard, HmsWarning, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { CreditLimitState } from "@/lib/hms/folio-credit-limits-shared";

export type StayCredit = CreditLimitState & { stayLimit: number | null; defaultLimit: number | null };

/** The warning at the top of the bill once the guest owes close to, or more than, their limit. */
export function CreditLimitBanner({ credit, currency }: { credit: StayCredit | undefined; currency: string }) {
  if (!credit || credit.limit == null) return null;
  const owes = formatPricingAmount(credit.balance, currency);
  const limit = formatPricingAmount(credit.limit, currency);
  if (credit.level === "over") {
    return (
      <HmsWarning title="Over the credit limit">
        {`The guest owes ${owes}, which is ${formatPricingAmount(credit.overBy, currency)} over their limit of ${limit}. Take a payment before adding more charges, or ask a manager to raise the limit.`}
      </HmsWarning>
    );
  }
  if (credit.level === "near") {
    return (
      <p role="note" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {`Close to the credit limit: the guest owes ${owes} of their ${limit} limit.`}
      </p>
    );
  }
  return null;
}

/**
 * How much this guest can owe before staff are warned. A stay uses the hotel's default unless it
 * has its own limit; changing it needs a manager's PIN for staff who aren't admins.
 */
export function CreditLimitCard({
  slug,
  reservationId,
  currency,
  credit,
  editable,
  onChanged,
}: {
  slug: string;
  reservationId: string;
  currency: string;
  credit: StayCredit | undefined;
  editable: boolean;
  onChanged: () => void;
}) {
  const ids = useId();
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState(credit?.stayLimit ? String(credit.stayLimit) : "");
  const [pin, setPin] = useState("");
  const [needsPin, setNeedsPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!credit) return null;

  const save = async (limit: number | null) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/folio/credit-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, limit, managerPin: pin.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.needsPin) setNeedsPin(true);
        setError(data.error ?? "That didn't save.");
        return;
      }
      toastSuccess(limit == null ? "This stay now uses the hotel's limit" : "Credit limit saved");
      setEditing(false);
      setPin("");
      setNeedsPin(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const summary =
    credit.limit == null
      ? "No credit limit. The guest can owe any amount without a warning."
      : credit.source === "stay"
        ? `This stay's own limit is ${formatPricingAmount(credit.limit, currency)}${credit.defaultLimit ? ` (the hotel's default is ${formatPricingAmount(credit.defaultLimit, currency)})` : ""}.`
        : `The hotel's default limit of ${formatPricingAmount(credit.limit, currency)} applies.`;

  return (
    <HmsCard
      id="folio-credit-limit"
      icon={Gauge}
      meaning="money"
      title="Credit limit"
      description="How much the guest can owe before staff are warned, here and on the front desk board. Charges billed to a company or travel agent don't count."
    >
      <div className="space-y-3 text-sm">
        <p className="text-slate-800">{summary}</p>
        <p className="text-slate-700">{`The guest owes ${formatPricingAmount(credit.balance, currency)} on their own part of the bill.`}</p>

        {editable && !editing ? (
          <button type="button" className={hmsButton.secondary} onClick={() => setEditing(true)}>
            {credit.source === "stay" ? "Change this stay's limit" : "Give this stay its own limit"}
          </button>
        ) : null}

        {editing ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <div>
              <label htmlFor={`${ids}-amount`} className="mb-1 block font-medium text-slate-800">
                Limit for this stay
              </label>
              <input
                id={`${ids}-amount`}
                type="number"
                min="1"
                step="0.01"
                className={`${hmsInput} max-w-xs tabular-nums`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            {needsPin ? (
              <div>
                <label htmlFor={`${ids}-pin`} className="mb-1 block font-medium text-slate-800">
                  Manager PIN
                </label>
                <input
                  id={`${ids}-pin`}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  className={`${hmsInput} max-w-[12rem]`}
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                />
              </div>
            ) : null}
            {error ? <HmsAlert message={error} /> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={hmsButton.primary} disabled={busy || !(Number(amount) > 0)} onClick={() => void save(Number(amount))}>
                {busy ? "Saving…" : "Save limit"}
              </button>
              {credit.source === "stay" ? (
                <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void save(null)}>
                  Use the hotel&apos;s limit
                </button>
              ) : null}
              <button type="button" className={hmsButton.quiet} disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </HmsCard>
  );
}
