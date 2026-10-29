"use client";

import { useEffect, useId, useState } from "react";
import { Percent } from "lucide-react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { HmsAlert, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";

type Target = "room" | "bill";
type Mode = "percent" | "amount";
type PreviewLine = { part: string; amount: number; description: string };

const PART_LABEL: Record<string, string> = {
  room: "Room",
  bill: "Bill",
  service_charge: "Service charge",
  state_levy: "State / local levy",
  vat: "VAT",
};

/**
 * Give a discount while checking a guest out: off the room (its taxes come off too) or off the
 * whole bill, as a percentage or an amount, always with a reason. Shows exactly what will come off
 * before it is given, and asks for a manager's PIN only when the discount is over the hotel's limit.
 */
export function CheckoutDiscountForm({
  slug,
  reservationId,
  currency,
  onApplied,
}: {
  slug: string;
  reservationId: string;
  currency: string;
  onApplied: () => void;
}) {
  const ids = useId();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>("room");
  const [mode, setMode] = useState<Mode>("percent");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [preview, setPreview] = useState<{ lines: PreviewLine[]; total: number; needsPin: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const amount = Number(value);

  useEffect(() => {
    if (!open || !(amount > 0)) {
      setPreview(null);
      setError(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/hotel/folio/discounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, reservationId, target, mode, value: amount, reason: reason.trim() || "Preview", preview: true }),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setPreview(null);
          setError(data.error ?? "Couldn't work out the discount.");
          return;
        }
        setError(null);
        setPreview({ lines: data.lines ?? [], total: Number(data.total) || 0, needsPin: Boolean(data.needsPin) });
      } catch {
        /* a newer preview replaced this one */
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, slug, reservationId, target, mode, amount, reason]);

  const reset = () => {
    setValue("");
    setReason("");
    setPin("");
    setPreview(null);
    setError(null);
  };

  const apply = async () => {
    if (!reason.trim()) {
      setError("Say why the discount is given.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/folio/discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          reservationId,
          target,
          mode,
          value: amount,
          reason: reason.trim(),
          managerPin: pin.trim() || undefined,
          source: "checkout",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Couldn't give the discount.");
        if (data.requiresPin) setPreview((p) => (p ? { ...p, needsPin: true } : p));
        return;
      }
      toastSuccess("Discount given", `${formatPricingAmount(Number(data.total) || 0, currency)} taken off the bill.`);
      reset();
      setOpen(false);
      onApplied();
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button type="button" className={hmsButton.secondary} onClick={() => setOpen(true)}>
        <Percent className="h-4 w-4" aria-hidden />
        Give a discount
      </button>
    );
  }

  const radio = "h-4 w-4 border-slate-300 text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500";

  return (
    <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4 text-sm">
      <legend className="flex items-center gap-2 px-1 font-semibold text-slate-900">
        <Percent className="h-4 w-4 text-blue-700" aria-hidden />
        Give a discount
      </legend>

      <div role="radiogroup" aria-label="What the discount comes off" className="space-y-1.5">
        <p className="font-medium text-slate-800">Take it off</p>
        <label className="flex items-start gap-2">
          <input type="radio" name={`${ids}-target`} className={`${radio} mt-0.5`} checked={target === "room"} onChange={() => setTarget("room")} />
          <span>
            The room
            <span className="block text-xs text-slate-600">The service charge, levy and VAT on that amount come off too.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name={`${ids}-target`} className={`${radio} mt-0.5`} checked={target === "bill"} onChange={() => setTarget("bill")} />
          <span>
            The whole bill
            <span className="block text-xs text-slate-600">One amount off everything, food and extras included.</span>
          </span>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${ids}-mode`} className="mb-1 block font-medium text-slate-800">
            As
          </label>
          <select id={`${ids}-mode`} className={`${hmsInput} cursor-pointer`} value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="percent">A percentage</option>
            <option value="amount">An amount</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-value`} className="mb-1 block font-medium text-slate-800">
            {mode === "percent" ? "Percentage off" : `Amount off (${currency})`}
          </label>
          <input
            id={`${ids}-value`}
            type="number"
            inputMode="decimal"
            min="0"
            max={mode === "percent" ? 100 : undefined}
            step={mode === "percent" ? "0.5" : "0.01"}
            className={`${hmsInput} tabular-nums`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor={`${ids}-reason`} className="mb-1 block font-medium text-slate-800">
          Reason
        </label>
        <input
          id={`${ids}-reason`}
          className={hmsInput}
          maxLength={150}
          placeholder="For example: air conditioning broken, loyal guest"
          aria-describedby={`${ids}-reason-hint`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p id={`${ids}-reason-hint`} className="mt-1 text-xs text-slate-600">
          Shown on the bill and kept in the log.
        </p>
      </div>

      {preview ? (
        <div role="status" className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="font-medium text-slate-900">
            This takes {formatPricingAmount(preview.total, currency)} off the bill
          </p>
          {preview.lines.length > 1 ? (
            <ul className="mt-1 space-y-0.5 text-xs text-slate-700">
              {preview.lines.map((l) => (
                <li key={l.part} className="flex justify-between gap-2">
                  <span>{PART_LABEL[l.part] ?? l.part}</span>
                  <span className="tabular-nums">− {formatPricingAmount(l.amount, currency)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {preview?.needsPin ? (
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
            aria-describedby={`${ids}-pin-hint`}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
          <p id={`${ids}-pin-hint`} className="mt-1 text-xs text-slate-600">
            This discount is over what staff can give on their own.
          </p>
        </div>
      ) : null}

      {error ? <HmsAlert message={error} /> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={hmsButton.primary}
          disabled={busy || !preview || !reason.trim() || (preview.needsPin && !pin.trim())}
          onClick={() => void apply()}
        >
          {busy ? "Giving discount…" : preview ? `Give ${formatPricingAmount(preview.total, currency)} discount` : "Give discount"}
        </button>
        <button
          type="button"
          className={hmsButton.secondary}
          disabled={busy}
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
