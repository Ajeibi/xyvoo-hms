"use client";

import { useState } from "react";
import { BedDouble } from "lucide-react";
import type { FolioLineRow } from "@/lib/hms/folio";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { HmsWarning, hmsButton } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";

/** What the folio API says about nights a guest has stayed past departure. */
export type ExtraNightsInfo = {
  charged: number;
  chargedTotal: number;
  waiting: number;
  waitingFrom: string | null;
  waitingTo: string | null;
  nightlyRate: number;
  autoLimit: number;
};

function formatNight(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function nightsText(n: number) {
  return `${n} night${n === 1 ? "" : "s"}`;
}

/**
 * Tells staff about extra nights on an overdue stay: how many were charged, and when the stay is
 * past the automatic limit, asks them to check the guest is still here before charging more.
 */
export function ExtraNightsNotice({
  slug,
  reservationId,
  currency,
  info,
  onConfirmed,
}: {
  slug: string;
  reservationId: string;
  currency: string;
  info: ExtraNightsInfo | null | undefined;
  onConfirmed: (data: { folio: { lines: FolioLineRow[]; balance: number }; extraNights: ExtraNightsInfo }) => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!info || (info.charged === 0 && info.waiting === 0)) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/folio/extra-nights/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Couldn't charge the nights", data.error ?? "Please try again.");
        return;
      }
      toastSuccess(
        "Extra nights charged",
        `${nightsText(data.postedNights ?? 0)} added to the bill (${formatPricingAmount(data.postedAmount ?? 0, currency)} with taxes).`,
      );
      onConfirmed(data);
    } finally {
      setBusy(false);
    }
  };

  if (info.waiting > 0) {
    const range =
      info.waitingFrom && info.waitingTo && info.waitingFrom !== info.waitingTo
        ? `${formatNight(info.waitingFrom)} to ${formatNight(info.waitingTo)}`
        : info.waitingFrom
          ? formatNight(info.waitingFrom)
          : "";
    return (
      <HmsWarning title="Is this guest still here?">
        <p>
          {[
            `This stay is more than ${nightsText(info.autoLimit)} past departure, so we've stopped adding nights on our own.`,
            info.charged > 0 ? `${nightsText(info.charged)} ${info.charged === 1 ? "is" : "are"} on the bill.` : "",
            `${nightsText(info.waiting)} (${range}) ${info.waiting === 1 ? "is" : "are"} not charged yet, at ${formatPricingAmount(info.nightlyRate, currency)} a night before taxes.`,
          ]
            .filter(Boolean)
            .join(" ")}
        </p>
        <p className="mt-1">If the guest is still in the room, charge them now. If they have left, check them out instead.</p>
        <button type="button" className={`${hmsButton.primary} mt-3`} onClick={() => void confirm()} disabled={busy}>
          {busy ? "Charging…" : `Guest is still here: charge ${nightsText(info.waiting)}`}
        </button>
      </HmsWarning>
    );
  }

  return (
    <div role="note" className="flex gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-950">
      <BedDouble className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden />
      <p>
        {`Stayed past departure: ${nightsText(info.charged)} added to the bill (${formatPricingAmount(info.chargedTotal, currency)} with taxes). Another night is added each day at check-out time until the guest checks out. To waive a night, void its room line; its taxes go with it.`}
      </p>
    </div>
  );
}
