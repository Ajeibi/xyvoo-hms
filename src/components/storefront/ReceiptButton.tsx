"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { dashButton } from "./dashboard-ui";

/**
 * "Download receipt" for an order in the dashboard. Paid orders download
 * their numbered receipt; bank transfer orders still awaiting payment
 * download an invoice (pass kind="invoice" to label it so). Shows a friendly
 * message, never a raw error, when there's nothing to download yet.
 */
export default function ReceiptButton({
  slug,
  orderId,
  kind = "receipt",
  variant = "secondary",
}: {
  slug: string;
  orderId: string;
  kind?: "receipt" | "invoice";
  variant?: keyof typeof dashButton;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const label = kind === "invoice" ? "Download invoice" : "Download receipt";

  async function download() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/store/orders/${encodeURIComponent(orderId)}/receipt?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(res.status === 404 && typeof body.error === "string" ? body.error : `We couldn't make the ${kind} just now. Please try again.`);
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || `${kind}.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch {
      setError(`We couldn't make the ${kind} just now. Please check your connection and try again.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-busy={busy}
        className={`${dashButton[variant]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
        {busy ? `Preparing ${kind}…` : label}
      </button>
      <span role="status" className="text-xs text-red-700">
        {error}
      </span>
    </span>
  );
}
