"use client";

import { useId, useState } from "react";
import { Download, Mail, Printer } from "lucide-react";
import { HmsAlert, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";

/**
 * Print, download or email a stay's bill: the final invoice once the guest has checked out, or
 * the bill so far while they are still staying.
 */
export function InvoiceActions({
  slug,
  reservationId,
  isFinal,
  guestEmail,
}: {
  slug: string;
  reservationId: string;
  isFinal: boolean;
  guestEmail?: string | null;
}) {
  const ids = useId();
  const [emailOpen, setEmailOpen] = useState(false);
  const [to, setTo] = useState(guestEmail ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = `/api/hotel/folio/invoice?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(reservationId)}`;
  const what = isFinal ? "invoice" : "bill so far";

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/folio/invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, to: to.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "The email couldn't be sent.");
        return;
      }
      toastSuccess(isFinal ? "Invoice sent" : "Bill sent", `Emailed to ${data.to}${data.invoiceNumber ? ` (${data.invoiceNumber})` : ""}.`);
      setEmailOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a className={hmsButton.secondary} href={`${href}&view=1`} target="_blank" rel="noopener noreferrer">
          <Printer className="h-4 w-4" aria-hidden />
          Print {what}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <a className={hmsButton.secondary} href={href} download>
          <Download className="h-4 w-4" aria-hidden />
          Download PDF
        </a>
        <button type="button" className={hmsButton.secondary} aria-expanded={emailOpen} onClick={() => setEmailOpen((v) => !v)}>
          <Mail className="h-4 w-4" aria-hidden />
          Email {what}
        </button>
      </div>
      {emailOpen ? (
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 p-3 text-sm">
          <div className="min-w-[14rem] flex-1">
            <label htmlFor={`${ids}-to`} className="mb-1 block font-medium text-slate-800">
              Send to
            </label>
            <input
              id={`${ids}-to`}
              type="email"
              autoComplete="email"
              className={hmsInput}
              placeholder="guest@example.com"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <button type="button" className={hmsButton.primary} disabled={busy || !to.trim()} onClick={() => void send()}>
            {busy ? "Sending…" : "Send"}
          </button>
          {error ? (
            <div className="w-full">
              <HmsAlert message={error} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
