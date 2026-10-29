"use client";

import { useId, useState } from "react";
import { Download, Mail, MessageCircle, Printer } from "lucide-react";
import { HmsAlert, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastSuccess } from "@/lib/app-toast";

/**
 * Print, download, email or WhatsApp a stay's bill: the final invoice once the guest has checked
 * out, or the bill so far while they are still staying. WhatsApp opens the hotel's own WhatsApp
 * with the message and a private link to the bill ready; staff press send there.
 */
export function InvoiceActions({
  slug,
  reservationId,
  isFinal,
  guestEmail,
  guestPhone,
}: {
  slug: string;
  reservationId: string;
  isFinal: boolean;
  guestEmail?: string | null;
  guestPhone?: string | null;
}) {
  const ids = useId();
  const [emailOpen, setEmailOpen] = useState(false);
  const [to, setTo] = useState(guestEmail ?? "");
  const [waOpen, setWaOpen] = useState(false);
  const [phone, setPhone] = useState(guestPhone ?? "");
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

  const openWhatsApp = async () => {
    // Open the tab now, while the click still counts, or the browser blocks it as a pop-up.
    const tab = window.open("", "_blank");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/folio/invoice/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, phone: phone.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.link) {
        tab?.close();
        setError(data.error ?? "WhatsApp couldn't be opened.");
        return;
      }
      if (tab) {
        tab.opener = null;
        tab.location.href = data.link;
      } else {
        window.location.href = data.link;
      }
      toastSuccess("WhatsApp is open", `Press send in WhatsApp to send the ${what} to ${data.phone}.`);
      setWaOpen(false);
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
        <button type="button" className={hmsButton.secondary} aria-expanded={emailOpen} onClick={() => {
            setEmailOpen((v) => !v);
            setWaOpen(false);
            setError(null);
          }}>
          <Mail className="h-4 w-4" aria-hidden />
          Email {what}
        </button>
        <button
          type="button"
          className={hmsButton.secondary}
          aria-expanded={waOpen}
          onClick={() => {
            setWaOpen((v) => !v);
            setEmailOpen(false);
            setError(null);
          }}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          WhatsApp {what}
        </button>
      </div>
      {waOpen ? (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[14rem] flex-1">
              <label htmlFor={`${ids}-phone`} className="mb-1 block font-medium text-slate-800">
                Guest&apos;s WhatsApp number
              </label>
              <input
                id={`${ids}-phone`}
                type="tel"
                autoComplete="tel"
                className={hmsInput}
                placeholder="0803 123 4567"
                aria-describedby={`${ids}-phone-hint`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <button type="button" className={hmsButton.primary} disabled={busy || !phone.trim()} onClick={() => void openWhatsApp()}>
              {busy ? "Opening…" : "Open WhatsApp"}
              <span className="sr-only"> (opens in a new tab)</span>
            </button>
          </div>
          <p id={`${ids}-phone-hint`} className="text-xs text-slate-600">
            WhatsApp opens with the message and a private link to the {what} ready. Press send there. The link works for 30 days.
          </p>
          {error ? <HmsAlert message={error} /> : null}
        </div>
      ) : null}
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
