"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Mail } from "lucide-react";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { CancelBookingDialog } from "@/components/hms/reservations/CancelBookingDialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { ReservationEmailLogRow } from "@/lib/hms/reservation-emails";

const KIND_LABEL: Record<string, string> = { confirmation: "Confirmation", change: "Change notice", cancellation: "Cancellation notice" };

/**
 * On the booking page: change the dates of a booking that hasn't arrived (checked and priced
 * first), cancel it under the hotel's policy, and see or resend the emails the guest was sent.
 */
export function ReservationManageCard({
  slug,
  reservationId,
  status,
  arrivalDay,
  departureDay,
  guestName,
  currency,
  policyLines,
  cancelInfo,
}: {
  slug: string;
  reservationId: string;
  status: string;
  arrivalDay: string;
  departureDay: string;
  guestName: string;
  currency: string;
  policyLines: string[];
  cancelInfo: string | null;
}) {
  const router = useRouter();
  const [arrival, setArrival] = useState(arrivalDay);
  const [departure, setDeparture] = useState(departureDay);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [rate, setRate] = useState<{
    planCode: string | null;
    planName: string | null;
    averageRate: number;
    roomTotal: number;
    nights: { date: string; base: number; label: string | null }[];
    restrictionOverride: string | null;
  } | null>(null);
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [override, setOverride] = useState<{ reason: string; pin: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [emails, setEmails] = useState<ReservationEmailLogRow[]>([]);
  const editable = status === "confirmed";
  const cancelled = status === "cancelled";
  const changed = arrival !== arrivalDay || departure !== departureDay;

  useEffect(() => {
    let off = false;
    fetch(`/api/hotel/reservations/${reservationId}/rate?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!off && d) setRate(d);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [reservationId, slug, arrivalDay, departureDay]);

  useEffect(() => {
    let off = false;
    fetch(`/api/hotel/reservations/${reservationId}/emails?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!off && d) setEmails(d.emails ?? []);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [reservationId, slug]);

  const send = async (apply: boolean) => {
    setBusy(true);
    const res = await fetch(`/api/hotel/reservations/${reservationId}/change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        arrivalDay: arrival,
        departureDay: departure,
        preview: !apply,
        restrictionOverrideReason: override?.reason.trim() || undefined,
        managerPin: override?.pin || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setPreview(null);
      if (data.canOverrideRestriction || data.requiresPin) setOverride((o) => o ?? { reason: "", pin: "" });
      toastError("Not changed", data.error ?? "Please try again.");
      return;
    }
    if (!apply) {
      setPreview(data.changes ?? []);
      const broken: string[] = data.restrictions ?? [];
      setRestrictions(broken);
      if (broken.length > 0) setOverride((o) => o ?? { reason: "", pin: "" });
      return;
    }
    toastSuccess("Booking changed", "The new dates are saved.");
    setPreview(null);
    setRestrictions([]);
    setOverride(null);
    router.refresh();
  };

  const resend = async (kind: string) => {
    setBusy(true);
    const res = await fetch(`/api/hotel/reservations/${reservationId}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, kind }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toastError("Not sent", data.error ?? "Please try again.");
    toastSuccess("Email sent", data.to ? `Sent to ${data.to}.` : "The email was sent.");
    setEmails(data.emails ?? []);
  };

  return (
    <HmsCard id="reservation-manage" icon={CalendarDays} meaning="rooms" title="Change or cancel" description="Dates are checked against the rooms free and priced before anything is saved.">
      {rate && rate.averageRate > 0 ? (
        <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
          <p className="font-medium text-slate-900">
            Rate: {rate.planName ?? "Standard rate"}
            {rate.planCode ? ` (${rate.planCode})` : ""}
          </p>
          <p className="mt-0.5">
            {new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(rate.averageRate)} a night on average, room total{" "}
            {new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(rate.roomTotal)} before taxes.
          </p>
          {rate.nights.length > 0 && new Set(rate.nights.map((n) => n.base)).size > 1 ? (
            <ul className="mt-1 list-disc pl-5 text-slate-700">
              {rate.nights.map((n) => (
                <li key={n.date}>
                  {new Date(`${n.date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}:{" "}
                  {new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(n.base)}
                  {n.label ? ` (${n.label})` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {rate.restrictionOverride ? <p className="mt-1 text-amber-800">Sold past a rate rule by a manager: {rate.restrictionOverride}</p> : null}
        </div>
      ) : null}
      {editable ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm font-medium text-slate-800">
              Arrival
              <input type="date" className={`${hmsInput} mt-1`} value={arrival} onChange={(e) => { setArrival(e.target.value); setPreview(null); setRestrictions([]); setOverride(null); }} />
            </label>
            <label className="text-sm font-medium text-slate-800">
              Departure
              <input type="date" className={`${hmsInput} mt-1`} min={arrival} value={departure} onChange={(e) => { setDeparture(e.target.value); setPreview(null); setRestrictions([]); setOverride(null); }} />
            </label>
            <button type="button" className={hmsButton.small} disabled={busy || !changed || !arrival || !departure} onClick={() => send(false)}>
              Check the change
            </button>
          </div>
          {preview ? (
            <div role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
              <ul className="list-disc pl-5">
                {preview.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              {restrictions.length > 0 ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <p className="font-medium">These dates break the rate plan&apos;s rules</p>
                  <ul className="mt-1 list-disc pl-5">
                    {restrictions.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs">A manager can still allow it. Give the reason and their PIN (an admin needs no PIN).</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      className={hmsInput}
                      aria-label="Reason for the exception"
                      placeholder="Reason"
                      value={override?.reason ?? ""}
                      onChange={(e) => setOverride((o) => ({ pin: o?.pin ?? "", reason: e.target.value }))}
                    />
                    <input
                      className={hmsInput}
                      type="password"
                      autoComplete="off"
                      aria-label="Manager PIN"
                      placeholder="Manager PIN"
                      value={override?.pin ?? ""}
                      onChange={(e) => setOverride((o) => ({ reason: o?.reason ?? "", pin: e.target.value }))}
                    />
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className={`${hmsButton.primary} mt-3`}
                disabled={busy || (restrictions.length > 0 && !override?.reason.trim())}
                onClick={() => send(true)}
              >
                Save the change
              </button>
            </div>
          ) : null}
          <p className="text-xs text-slate-600">A room type that is full needs a manager to override it from the booking calendar.</p>
        </div>
      ) : null}

      {cancelled && cancelInfo ? <p className="text-sm text-slate-800">{cancelInfo}</p> : null}

      {policyLines.length > 0 && !cancelled ? (
        <div className="mt-3 text-sm text-slate-700">
          <p className="font-medium text-slate-900">Cancellation policy on this booking</p>
          <ul className="mt-1 list-disc pl-5">
            {policyLines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {status === "confirmed" ? (
        <div className="mt-4">
          <button type="button" className={hmsButton.secondary} onClick={() => setCancelOpen(true)}>
            Cancel this booking
          </button>
        </div>
      ) : null}

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <Mail className="h-4 w-4" aria-hidden /> Emails to the guest
        </p>
        {emails.length === 0 ? (
          <p className="mt-1 text-sm text-slate-600">No emails have been sent for this booking.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {emails.map((e) => (
              <li key={e.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>
                  {KIND_LABEL[e.kind] ?? e.kind}
                  {e.to ? ` to ${e.to}` : ""} · <span className={e.status === "sent" ? "text-emerald-700" : e.status === "failed" ? "text-red-700" : "text-slate-600"}>{e.status}</span>
                  {e.error ? ` (${e.error})` : ""}
                </span>
                <span className="text-slate-600">{new Date(e.createdAt).toLocaleString("en-GB")}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {cancelled ? (
            <button type="button" className={hmsButton.small} disabled={busy} onClick={() => resend("cancellation")}>
              Send the cancellation notice again
            </button>
          ) : (
            <>
              <button type="button" className={hmsButton.small} disabled={busy} onClick={() => resend("confirmation")}>
                Send the confirmation again
              </button>
              {editable ? (
                <button type="button" className={hmsButton.small} disabled={busy} onClick={() => resend("change")}>
                  Send a change notice
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      <CancelBookingDialog
        slug={slug}
        reservationId={reservationId}
        guestName={guestName}
        currency={currency}
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onDone={() => {
          setCancelOpen(false);
          router.refresh();
        }}
      />
    </HmsCard>
  );
}
