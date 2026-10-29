"use client";

import { useEffect, useId, useState } from "react";
import { Landmark } from "lucide-react";
import { HmsAlert, HmsCard, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import {
  DEPOSIT_METHODS,
  DEPOSIT_METHOD_LABEL,
  type DepositMethod,
  type DepositState,
  type DepositStatus,
} from "@/lib/hms/folio-deposits-shared";

const STATUS: Record<DepositStatus, { label: string; tone: "green" | "amber" | "red" | "blue" | "slate" }> = {
  none: { label: "No deposit needed", tone: "slate" },
  paid: { label: "Deposit paid", tone: "green" },
  part: { label: "Part paid", tone: "amber" },
  due: { label: "Deposit due", tone: "blue" },
  overdue: { label: "Deposit overdue", tone: "red" },
};

function day(date: string) {
  return new Date(date.length === 10 ? `${date}T12:00:00.000Z` : date).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** A booking's deposit: what is asked for and by when, what has been paid, and taking a payment. */
export function ReservationDepositCard({ slug, reservationId, currency }: { slug: string; reservationId: string; currency: string }) {
  const ids = useId();
  const [deposit, setDeposit] = useState<DepositState | null>(null);
  const [bookingStatus, setBookingStatus] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<DepositMethod>("cash");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState<{ id: string; action: "refund" | "keep" } | null>(null);
  const [settleMethod, setSettleMethod] = useState<"cash" | "pos">("cash");
  const [settleSlip, setSettleSlip] = useState("");
  const [settleReason, setSettleReason] = useState("");
  const [settlePin, setSettlePin] = useState("");
  const [settleError, setSettleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/reservations/deposits?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(reservationId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setDeposit(data.deposit);
        setBookingStatus(data.status);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, reservationId]);

  if (!deposit) return null;
  const remaining = Math.max(0, Math.round((deposit.required - deposit.paid) * 100) / 100);
  const canTake = bookingStatus === "confirmed";
  // A deposit can be given back or kept until the guest checks in (then it is on their bill).
  const canSettle = bookingStatus !== "checked_in" && bookingStatus !== "checked_out";

  function startSettle(id: string, action: "refund" | "keep") {
    setSettling({ id, action });
    setSettleMethod("cash");
    setSettleSlip("");
    setSettleReason("");
    setSettlePin("");
    setSettleError(null);
  }

  const settle = async () => {
    if (!settling) return;
    setBusy(true);
    setSettleError(null);
    try {
      const res = await fetch("/api/hotel/reservations/deposits/settle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          depositId: settling.id,
          action: settling.action,
          method: settling.action === "refund" ? settleMethod : undefined,
          posReference: settling.action === "refund" && settleMethod === "pos" ? settleSlip.trim() : undefined,
          reason: settleReason.trim(),
          managerPin: settlePin.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSettleError(data.error ?? "That couldn't be saved.");
        return;
      }
      if (data.deposit) setDeposit(data.deposit);
      toastSuccess(settling.action === "refund" ? "Deposit refunded" : "Deposit kept", settling.action === "refund" ? "Recorded and booked." : "Booked as a cancellation fee.");
      setSettling(null);
    } finally {
      setBusy(false);
    }
  };
  const status = STATUS[deposit.status];

  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/reservations/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, amount: Number(amount), method, reference: reference.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The deposit couldn't be saved.");
        return;
      }
      setDeposit(data.deposit);
      toastSuccess("Deposit taken", `${formatPricingAmount(Number(amount), currency)} is held for the guest and goes on their bill at check-in.`);
      setOpen(false);
      setAmount("");
      setReference("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <HmsCard id="reservation-deposit" icon={Landmark} meaning="money" title="Deposit" description="Money paid before arrival. It's held for the guest and goes on their bill when they check in.">
      <div className="space-y-3 text-sm">
        <p className="flex flex-wrap items-center gap-2">
          <HmsPill tone={status.tone}>{status.label}</HmsPill>
          {deposit.required > 0 ? (
            <span className="text-slate-700">
              {formatPricingAmount(deposit.paid, currency)} of {formatPricingAmount(deposit.required, currency)} paid
              {deposit.status !== "paid" && deposit.dueDate ? `, due ${day(deposit.dueDate)}` : ""}
            </span>
          ) : null}
        </p>
        {deposit.fromCurrentPolicy && deposit.required > 0 ? (
          <p className="text-xs text-slate-600">This booking was made before deposits were set, so it follows today&apos;s deposit rules.</p>
        ) : null}

        {deposit.payments.length > 0 ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200" aria-label="Deposit payments">
            {deposit.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 px-3 py-2">
                <span>
                  {DEPOSIT_METHOD_LABEL[p.method]}, {day(p.receivedAt)}
                  {p.reference ? <span className="text-slate-600"> · {p.reference}</span> : null}
                  <span className="block text-xs text-slate-600">
                    {p.status === "applied" && p.appliedAt
                      ? `On the guest's bill since ${day(p.appliedAt)}`
                      : p.status === "refunded"
                        ? `Refunded${p.settleReason ? `: ${p.settleReason}` : ""}`
                        : p.status === "kept"
                          ? `Kept as a cancellation fee${p.settleReason ? `: ${p.settleReason}` : ""}`
                          : "Held until check-in"}
                  </span>
                  {p.status === "held" && canSettle ? (
                    <span className="mt-1 flex flex-wrap gap-1">
                      <button type="button" className={hmsButton.quiet} onClick={() => startSettle(p.id, "refund")}>
                        Refund<span className="sr-only"> this deposit</span>
                      </button>
                      <button type="button" className={hmsButton.quiet} onClick={() => startSettle(p.id, "keep")}>
                        Keep as a cancellation fee<span className="sr-only"> for this deposit</span>
                      </button>
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums text-slate-900">{formatPricingAmount(p.amount, currency)}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {settling ? (
          <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
            <legend className="px-1 font-semibold text-slate-900">
              {settling.action === "refund" ? "Refund this deposit" : "Keep this deposit as a cancellation fee"}
            </legend>
            {settling.action === "refund" ? (
              <>
                <p className="text-slate-700">Hand the money back first, then record it here.</p>
                <div>
                  <label htmlFor={`${ids}-settle-method`} className="mb-1 block font-medium text-slate-800">
                    Given back by
                  </label>
                  <select id={`${ids}-settle-method`} className={`${hmsInput} cursor-pointer`} value={settleMethod} onChange={(e) => setSettleMethod(e.target.value as "cash" | "pos")}>
                    <option value="cash">Cash from the till</option>
                    <option value="pos">Reversal on the card machine</option>
                  </select>
                </div>
                {settleMethod === "pos" ? (
                  <div>
                    <label htmlFor={`${ids}-settle-slip`} className="mb-1 block font-medium text-slate-800">
                      Reversal slip number
                    </label>
                    <input id={`${ids}-settle-slip`} className={`${hmsInput} max-w-xs`} maxLength={60} value={settleSlip} onChange={(e) => setSettleSlip(e.target.value)} />
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-slate-700">The deposit becomes room revenue, for example when the guest cancels late or doesn&apos;t arrive.</p>
            )}
            <div>
              <label htmlFor={`${ids}-settle-reason`} className="mb-1 block font-medium text-slate-800">
                Reason
              </label>
              <input id={`${ids}-settle-reason`} className={hmsInput} maxLength={150} value={settleReason} onChange={(e) => setSettleReason(e.target.value)} placeholder={settling.action === "refund" ? "For example: cancelled in good time" : "For example: cancelled the day before arrival"} />
            </div>
            <div>
              <label htmlFor={`${ids}-settle-pin`} className="mb-1 block font-medium text-slate-800">
                Manager PIN
              </label>
              <input id={`${ids}-settle-pin`} type="password" inputMode="numeric" autoComplete="off" className={`${hmsInput} max-w-[12rem]`} aria-describedby={`${ids}-settle-pin-hint`} value={settlePin} onChange={(e) => setSettlePin(e.target.value)} />
              <p id={`${ids}-settle-pin-hint`} className="mt-1 text-xs text-slate-600">
                Needed unless you&apos;re a manager or admin.
              </p>
            </div>
            {settleError ? <HmsAlert message={settleError} /> : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={hmsButton.primary}
                disabled={busy || !settleReason.trim() || (settling.action === "refund" && settleMethod === "pos" && !settleSlip.trim())}
                onClick={() => void settle()}
              >
                {busy ? "Saving…" : settling.action === "refund" ? "Record the refund" : "Keep the deposit"}
              </button>
              <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => setSettling(null)}>
                Cancel
              </button>
            </div>
          </fieldset>
        ) : null}

        {canTake && !open ? (
          <button
            type="button"
            className={hmsButton.secondary}
            onClick={() => {
              setAmount(remaining > 0 ? String(remaining) : "");
              setOpen(true);
            }}
          >
            Take a deposit
          </button>
        ) : null}

        {open ? (
          <fieldset className="space-y-3 rounded-xl border border-slate-200 p-3">
            <legend className="px-1 font-semibold text-slate-900">Take a deposit</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor={`${ids}-amount`} className="mb-1 block font-medium text-slate-800">
                  Amount ({currency})
                </label>
                <input id={`${ids}-amount`} type="number" min="0" step="0.01" inputMode="decimal" className={`${hmsInput} tabular-nums`} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <label htmlFor={`${ids}-method`} className="mb-1 block font-medium text-slate-800">
                  Paid by
                </label>
                <select id={`${ids}-method`} className={`${hmsInput} cursor-pointer`} value={method} onChange={(e) => setMethod(e.target.value as DepositMethod)}>
                  {DEPOSIT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {DEPOSIT_METHOD_LABEL[m]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor={`${ids}-ref`} className="mb-1 block font-medium text-slate-800">
                Receipt or transfer reference (optional)
              </label>
              <input id={`${ids}-ref`} className={hmsInput} maxLength={120} value={reference} onChange={(e) => setReference(e.target.value)} />
            </div>
            {error ? <HmsAlert message={error} /> : null}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={hmsButton.primary} disabled={busy || !(Number(amount) > 0)} onClick={() => void take()}>
                {busy ? "Saving…" : `Take ${Number(amount) > 0 ? formatPricingAmount(Number(amount), currency) : "deposit"}`}
              </button>
              <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </fieldset>
        ) : null}
      </div>
    </HmsCard>
  );
}
