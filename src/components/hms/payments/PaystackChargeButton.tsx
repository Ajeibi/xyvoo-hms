"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";

async function loadPaystackPop() {
  const mod = await import("@paystack/inline-js");
  return mod.default;
}

export function PaystackChargeButton({
  slug,
  reservationId,
  amount,
  email,
  purpose = "folio_charge",
  label = "Charge with Paystack",
  variant = "default" as const,
  size = "default" as const,
  disabled,
  onSuccess,
}: {
  slug: string;
  reservationId: string;
  amount: number;
  email?: string;
  purpose?: "folio_charge" | "preauth";
  label?: string;
  variant?: "default" | "outline" | "secondary";
  size?: "default" | "sm" | "lg";
  disabled?: boolean;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const charge = useCallback(async () => {
    if (!amount || amount <= 0) {
      toastError("Invalid amount", "Enter a positive amount.");
      return;
    }
    setLoading(true);
    try {
      const initRes = await fetch("/api/hotel/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, amount, email, purpose }),
      });
      const initData = await initRes.json();
      if (!initRes.ok) {
        toastError("Could not start payment", initData.error ?? "Try again.");
        return;
      }

      const PaystackPop = await loadPaystackPop();
      const popup = new PaystackPop();
      popup.newTransaction({
        key: initData.publicKey as string,
        email: email ?? `guest@${slug}.local`,
        amount: Math.round(amount * 100),
        reference: initData.reference as string,
        accessCode: initData.accessCode as string,
        onSuccess: () => {
          void (async () => {
            const verifyRes = await fetch("/api/hotel/paystack/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ slug, reference: initData.reference }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyRes.ok) {
              toastError("Payment verification failed", verifyData.error ?? "Contact support.");
              return;
            }
            toastSuccess(purpose === "preauth" ? "Card authorized" : "Payment received");
            onSuccess?.();
          })();
        },
        onCancel: () => {
          toastError("Payment cancelled", "Guest closed the Paystack window.");
        },
      });
    } catch {
      toastError("Payment error", "Could not open Paystack.");
    } finally {
      setLoading(false);
    }
  }, [amount, email, onSuccess, purpose, reservationId, slug]);

  return (
    <Button type="button" variant={variant} size={size} disabled={disabled || loading} onClick={() => void charge()}>
      {loading ? "Opening Paystack…" : label}
    </Button>
  );
}

export function PaystackCaptureButton({
  slug,
  reservationId,
  amount,
  label = "Capture authorized card",
  onSuccess,
}: {
  slug: string;
  reservationId: string;
  amount: number;
  label?: string;
  onSuccess?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const capture = async () => {
    if (!amount || amount <= 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/hotel/paystack/charge-authorization", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Capture failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Payment captured");
      onSuccess?.();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" disabled={loading || amount <= 0} onClick={() => void capture()}>
      {loading ? "Capturing…" : label}
    </Button>
  );
}
