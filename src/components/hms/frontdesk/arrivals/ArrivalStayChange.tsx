"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { HmsAlert, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { StayChangePreview } from "@/lib/hms/stay-changes";

export function ArrivalStayChange({
  slug,
  reservationId,
  departureDate,
  onChanged,
}: {
  slug: string;
  reservationId: string;
  /** The booking's current departure date, YYYY-MM-DD. */
  departureDate: string;
  onChanged: () => void;
}) {
  const [date, setDate] = useState(departureDate);
  const [preview, setPreview] = useState<StayChangePreview | null>(null);
  const [currency, setCurrency] = useState("NGN");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);

  const url = `/api/hotel/frontdesk/arrivals/${reservationId}/stay-change`;

  useEffect(() => {
    setDate(departureDate);
    setPreview(null);
    setError(null);
  }, [departureDate, reservationId]);

  useEffect(() => {
    if (!date || date === departureDate) {
      setPreview(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, newDepartureDate: date, preview: true }),
        });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setPreview(null);
          setError(json.error ?? "Could not check that date.");
        } else {
          setPreview(json.preview);
          setCurrency(json.currency ?? "NGN");
          setError(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [date, departureDate, slug, url]);

  const money = (n: number) => formatPricingAmount(n, currency);
  const blocked = Boolean(preview?.blocker) || (preview?.conflicts.length ?? 0) > 0;

  async function apply() {
    if (!preview || blocked || saving) return;
    setSaving(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, newDepartureDate: date }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error ?? "Could not change the stay.";
        setError(msg);
        toastError("Stay not changed", msg);
        return;
      }
      toastSuccess(preview.kind === "extend" ? "Stay extended" : "Departure brought forward");
      setPreview(null);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <HmsField id="stay-new-departure" label="New departure date" hint="Pick a later date to extend, or an earlier one to leave early.">
        <input
          id="stay-new-departure"
          aria-describedby="stay-new-departure-hint"
          type="date"
          className={hmsInput}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </HmsField>

      {checking ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Checking the room and the price…
        </p>
      ) : null}

      {preview && !checking ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
          <p className="font-medium">
            {preview.kind === "extend"
              ? `${preview.changeNights} more night${preview.changeNights === 1 ? "" : "s"}, ${preview.newNights} in all`
              : `${preview.changeNights} night${preview.changeNights === 1 ? "" : "s"} fewer, ${preview.newNights} in all`}
          </p>
          <p className="mt-1">
            {preview.kind === "extend"
              ? `Adds ${money(preview.amount)} to the bill${preview.nightlyRate ? ` (${money(preview.nightlyRate)} a night before tax)` : ""}.`
              : preview.amount > 0
                ? `Takes ${money(preview.amount)} off the bill.`
                : "Nothing to take off the bill."}
          </p>
          <p className="mt-1 text-slate-600">Housekeeping is told the room's new departure date.</p>
          {preview.conflicts.length > 0 ? (
            <ul className="mt-2 list-disc pl-5 text-red-800">
              {preview.conflicts.map((c) => (
                <li key={c.label}>{c.label}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {preview?.blocker ? <HmsAlert message={preview.blocker} /> : null}
      {error ? <HmsAlert message={error} /> : null}

      {preview ? (
        <button type="button" className={hmsButton.primary} disabled={blocked || saving || checking} onClick={() => void apply()}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {preview.kind === "extend" ? "Extend the stay" : "Bring departure forward"}
        </button>
      ) : null}
    </div>
  );
}
