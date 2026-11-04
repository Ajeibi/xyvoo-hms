"use client";

import { useEffect, useId, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HmsWarning, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { describePolicy, type CancellationPolicy, type CancellationQuote } from "@/lib/hms/reservation-cancellation-shared";

type Preview = {
  confirmationCode: string;
  policy: CancellationPolicy;
  policyFromBooking: boolean;
  quote: CancellationQuote;
  stayTotal: number;
  deposits: { id: string; amount: number; method: string; receivedAt: string }[];
  depositsTotal: number;
  isManager: boolean;
};

type Choice = "leave" | "keep" | "refund_cash" | "refund_pos";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

/**
 * Cancelling a booking that hasn't arrived: shows the hotel's cancellation policy and the fee it
 * asks for today, lets staff waive the fee or settle held deposits (manager's PIN for those),
 * and records why.
 */
export function CancelBookingDialog({
  slug,
  reservationId,
  guestName,
  currency,
  open,
  onClose,
  onDone,
}: {
  slug: string;
  reservationId: string;
  guestName: string;
  currency: string;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const ids = useId();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [waive, setWaive] = useState(false);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [slips, setSlips] = useState<Record<string, string>>({});
  const [pin, setPin] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [busy, setBusy] = useState(false);
  const [needsPin, setNeedsPin] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setPreview(null);
    setLoadError(null);
    setReason("");
    setWaive(false);
    setPin("");
    setNeedsPin(false);
    fetch(`/api/hotel/reservations/${reservationId}/cancel?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setLoadError(data.error ?? "Could not load the cancellation terms.");
          return;
        }
        const p = data as Preview;
        setPreview(p);
        const next: Record<string, Choice> = {};
        for (const d of p.deposits) next[d.id] = p.quote.fee >= d.amount && p.quote.fee > 0 ? "keep" : "leave";
        setChoices(next);
      })
      .catch(() => !cancelled && setLoadError("Could not load the cancellation terms."));
    return () => {
      cancelled = true;
    };
  }, [open, reservationId, slug]);

  const decisions = (preview?.deposits ?? [])
    .filter((d) => (choices[d.id] ?? "leave") !== "leave")
    .map((d) => {
      const c = choices[d.id];
      return {
        depositId: d.id,
        action: c === "keep" ? ("keep" as const) : ("refund" as const),
        ...(c === "refund_cash" ? { method: "cash" as const } : {}),
        ...(c === "refund_pos" ? { method: "pos" as const, posReference: slips[d.id]?.trim() ?? "" } : {}),
      };
    });
  const slipMissing = decisions.some((d) => d.method === "pos" && !d.posReference);
  const managerAction = waive || decisions.length > 0;
  const fee = preview ? (waive ? 0 : preview.quote.fee) : 0;
  const keptTotal = (preview?.deposits ?? []).filter((d) => choices[d.id] === "keep").reduce((s, d) => s + d.amount, 0);

  const submit = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/hotel/reservations/${reservationId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason, waiveFee: waive || undefined, depositDecisions: decisions.length ? decisions : undefined, managerPin: pin || undefined, sendEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.requiresPin) setNeedsPin(true);
        toastError("Not cancelled", data.error ?? "Try again.");
        return;
      }
      const notes: string[] = [];
      if (data.fee > 0) notes.push(`Fee ${formatPricingAmount(data.fee, currency)}${data.feeStatus === "owed" ? " is owed" : ""}.`);
      if (data.email?.status === "failed") notes.push("The cancellation email could not be sent.");
      if (data.email?.status === "skipped" && data.email.reason) notes.push(data.email.reason);
      if (data.depositErrors?.length) notes.push(data.depositErrors.join(" "));
      toastSuccess("Booking cancelled", [preview.confirmationCode, ...notes].join(" "));
      onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cancel this booking?</DialogTitle>
          <DialogDescription>
            {guestName} · {preview?.confirmationCode ?? ""}
          </DialogDescription>
        </DialogHeader>

        {loadError ? (
          <p role="alert" className="text-sm text-red-700">
            {loadError}
          </p>
        ) : !preview ? (
          <p role="status" className="text-sm text-slate-600">
            Loading the cancellation terms…
          </p>
        ) : (
          <div className="space-y-4 text-sm text-slate-700">
            <section aria-labelledby={`${ids}-policy`} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <h3 id={`${ids}-policy`} className="font-semibold text-slate-900">
                {preview.policy.name} cancellation policy{preview.policyFromBooking ? " (the one this booking was made under)" : ""}
              </h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {describePolicy(preview.policy, currency).map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>

            <div className={`rounded-xl border p-3 ${preview.quote.fee > 0 ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
              <p className="font-semibold text-slate-900">
                {preview.quote.fee > 0 ? `Cancellation fee: ${formatPricingAmount(preview.quote.fee, currency)}` : "No cancellation fee"}
              </p>
              <p className="mt-0.5">{preview.quote.summary}</p>
              {preview.quote.fee > 0 ? (
                <label className="mt-2 flex items-start gap-2">
                  <input type="checkbox" className="mt-1" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
                  <span>Waive the fee (a manager&apos;s PIN is needed)</span>
                </label>
              ) : null}
            </div>

            {preview.deposits.length > 0 ? (
              <section aria-labelledby={`${ids}-dep`}>
                <h3 id={`${ids}-dep`} className="font-semibold text-slate-900">
                  Deposits held ({formatPricingAmount(preview.depositsTotal, currency)})
                </h3>
                <ul className="mt-1 space-y-2">
                  {preview.deposits.map((d) => (
                    <li key={d.id} className="rounded-lg border border-slate-200 p-2">
                      <label htmlFor={`${ids}-d-${d.id}`} className="block font-medium text-slate-800">
                        {formatPricingAmount(d.amount, currency)} paid by {d.method}
                      </label>
                      <select
                        id={`${ids}-d-${d.id}`}
                        className={`${hmsInput} mt-1`}
                        value={choices[d.id] ?? "leave"}
                        onChange={(e) => setChoices((c) => ({ ...c, [d.id]: e.target.value as Choice }))}
                      >
                        <option value="leave">Leave it for now (settle it later from the booking)</option>
                        <option value="keep">Keep it as the cancellation fee</option>
                        <option value="refund_cash">Refund it in cash</option>
                        <option value="refund_pos">Refund it to the card machine</option>
                      </select>
                      {choices[d.id] === "refund_pos" ? (
                        <input
                          aria-label="Reversal slip number from the card machine"
                          placeholder="Reversal slip number"
                          className={`${hmsInput} mt-2`}
                          value={slips[d.id] ?? ""}
                          onChange={(e) => setSlips((s) => ({ ...s, [d.id]: e.target.value }))}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
                {keptTotal > 0 && fee > 0 && keptTotal > fee + 0.005 ? (
                  <div className="mt-2">
                    <HmsWarning title="You are keeping more than the fee">
                      The deposit kept ({formatPricingAmount(keptTotal, currency)}) is more than the fee ({formatPricingAmount(fee, currency)}). A deposit can only be kept or refunded in full, so refund it and
                      collect the fee separately if you want the exact amount.
                    </HmsWarning>
                  </div>
                ) : null}
                {keptTotal > 0 && fee > 0 && keptTotal + 0.005 < fee ? (
                  <p className="mt-2 text-slate-600">
                    The deposit kept covers {formatPricingAmount(keptTotal, currency)}. {formatPricingAmount(fee - keptTotal, currency)} of the fee will stay owed.
                  </p>
                ) : null}
              </section>
            ) : null}

            <div>
              <label htmlFor={`${ids}-reason`} className="mb-1 block font-medium text-slate-900">
                Why is it cancelled?
              </label>
              <input id={`${ids}-reason`} className={hmsInput} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: guest changed plans" maxLength={300} />
            </div>

            {managerAction && !preview.isManager ? (
              <div>
                <label htmlFor={`${ids}-pin`} className="mb-1 block font-medium text-slate-900">
                  Manager&apos;s PIN{needsPin ? " (needed)" : ""}
                </label>
                <input id={`${ids}-pin`} type="password" inputMode="numeric" autoComplete="off" className={`${hmsInput} max-w-40`} value={pin} onChange={(e) => setPin(e.target.value)} />
              </div>
            ) : null}

            <label className="flex items-center gap-2">
              <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
              <span>Email the guest a cancellation notice</span>
            </label>
          </div>
        )}

        <DialogFooter>
          <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={onClose} disabled={busy}>
            Keep booking
          </button>
          <button
            type="button"
            className={`inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-50 ${focusRing}`}
            onClick={() => void submit()}
            disabled={busy || !preview || !reason.trim() || slipMissing}
          >
            {busy ? "Cancelling…" : "Cancel booking"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
