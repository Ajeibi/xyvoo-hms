"use client";

import { useId, useState } from "react";
import { Undo2 } from "lucide-react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { HmsAlert, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";

/**
 * Record money handed back to a guest who has overpaid: cash from the till, or a reversal on the
 * card machine (with its slip number). Nothing is sent from here; it records what was done at the desk.
 */
export function RefundForm({
  slug,
  reservationId,
  currency,
  refundable,
  onDone,
}: {
  slug: string;
  reservationId: string;
  currency: string;
  /** What the guest has paid over their bill. */
  refundable: number;
  onDone: () => void;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "pos">("cash");
  const [slip, setSlip] = useState("");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (refundable <= 0.009) return null;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/folio/refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          reservationId,
          amount: Number(amount),
          method,
          posReference: method === "pos" ? slip.trim() : undefined,
          reason: reason.trim(),
          managerPin: pin.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The refund couldn't be recorded.");
        return;
      }
      toastSuccess(
        "Refund recorded",
        `${formatPricingAmount(Number(amount), currency)} handed back ${method === "cash" ? "in cash from the till" : "on the card machine"}.${data.cashFloatOpened ? " The cash drawer was opened for this shift." : ""}`,
      );
      setOpen(false);
      setAmount("");
      setSlip("");
      setReason("");
      setPin("");
      onDone();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div role="note" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <span>The guest has paid {formatPricingAmount(refundable, currency)} more than their bill.</span>
        <button
          type="button"
          className={hmsButton.secondary}
          onClick={() => {
            setAmount(String(refundable));
            setOpen(true);
          }}
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          Give money back
        </button>
      </div>
    );
  }

  const ready = Number(amount) > 0 && reason.trim() && (method === "cash" || slip.trim());
  return (
    <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4 text-sm">
      <legend className="flex items-center gap-2 px-1 font-semibold text-slate-900">
        <Undo2 className="h-4 w-4 text-amber-700" aria-hidden />
        Give money back
      </legend>
      <p className="text-slate-700">
        Hand the money back first, then record it here. Up to {formatPricingAmount(refundable, currency)} can be given back.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-amount`} className="mb-1 block font-medium text-slate-800">
            Amount ({currency})
          </label>
          <input id={`${ids}-amount`} type="number" min="0" step="0.01" inputMode="decimal" className={`${hmsInput} tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label htmlFor={`${ids}-method`} className="mb-1 block font-medium text-slate-800">
            Given back by
          </label>
          <select id={`${ids}-method`} className={`${hmsInput} cursor-pointer`} value={method} onChange={(e) => setMethod(e.target.value as "cash" | "pos")}>
            <option value="cash">Cash from the till</option>
            <option value="pos">Reversal on the card machine</option>
          </select>
        </div>
      </div>
      {method === "pos" ? (
        <div>
          <label htmlFor={`${ids}-slip`} className="mb-1 block font-medium text-slate-800">
            Reversal slip number
          </label>
          <input id={`${ids}-slip`} className={`${hmsInput} max-w-xs`} maxLength={60} aria-describedby={`${ids}-slip-hint`} value={slip} onChange={(e) => setSlip(e.target.value)} />
          <p id={`${ids}-slip-hint`} className="mt-1 text-xs text-slate-600">
            From the slip the card machine prints, so it can be matched with the bank.
          </p>
        </div>
      ) : null}
      <div>
        <label htmlFor={`${ids}-reason`} className="mb-1 block font-medium text-slate-800">
          Reason
        </label>
        <input id={`${ids}-reason`} className={hmsInput} maxLength={150} placeholder="For example: left a night early, paid twice" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      <div>
        <label htmlFor={`${ids}-pin`} className="mb-1 block font-medium text-slate-800">
          Manager PIN
        </label>
        <input id={`${ids}-pin`} type="password" inputMode="numeric" autoComplete="off" className={`${hmsInput} max-w-[12rem]`} aria-describedby={`${ids}-pin-hint`} value={pin} onChange={(e) => setPin(e.target.value)} />
        <p id={`${ids}-pin-hint`} className="mt-1 text-xs text-slate-600">
          Needed unless you&apos;re a manager or admin.
        </p>
      </div>
      {error ? <HmsAlert message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={hmsButton.primary} disabled={busy || !ready} onClick={() => void submit()}>
          {busy ? "Recording…" : `Record ${Number(amount) > 0 ? formatPricingAmount(Number(amount), currency) : ""} refund`}
        </button>
        <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
