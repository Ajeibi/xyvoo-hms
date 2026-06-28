"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { PAYMENT_STATUS_LABEL } from "./payment-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { PaystackChargeButton } from "@/components/hms/payments/PaystackChargeButton";

export function FrontDeskFolioSummary({
  slug,
  reservationId,
  folioNumber,
  currency,
}: {
  slug: string;
  reservationId: string;
  folioNumber: string;
  currency: string;
}) {
  const [balance, setBalance] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("");
  const [payAmount, setPayAmount] = useState("");
  const [paystackEnabled, setPaystackEnabled] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch(
      `/api/hotel/folio?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(reservationId)}`,
    );
    if (res.ok) {
      const data = await res.json();
      setBalance(data.folio.balance);
      setStatus(data.folio.displayStatus);
      if (data.folio.balance > 0) setPayAmount(String(data.folio.balance.toFixed(2)));
    }
  }, [slug, reservationId]);

  useEffect(() => {
    void reload();
    fetch(`/api/hotel/paystack?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setPaystackEnabled(Boolean(d.setup?.enabled && d.setup?.publicKey)))
      .catch(() => setPaystackEnabled(false));
  }, [reload, slug]);

  const quickPay = async () => {
    const amount = Number(payAmount);
    if (!amount || amount <= 0) return;
    const res = await fetch("/api/hotel/folio/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, reservationId, amount, method: "cash" }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not post payment", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Payment posted");
    setPayAmount("");
    void reload();
  };

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-800">Folio</p>
      <p className="mt-1 text-sm font-medium text-slate-900">
        {folioNumber}
        {balance != null ? (
          <span className="ml-2 tabular-nums">
            · Balance {formatPricingAmount(balance, currency)}
          </span>
        ) : null}
      </p>
      {status ? (
        <p className="text-xs text-slate-600">
          {PAYMENT_STATUS_LABEL[status as keyof typeof PAYMENT_STATUS_LABEL] ?? status}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={payAmount}
          onChange={(e) => setPayAmount(e.target.value)}
          placeholder="Amount"
          type="number"
          className="h-8 max-w-[120px] text-sm"
        />
        {paystackEnabled && balance != null && balance > 0 ? (
          <PaystackChargeButton
            slug={slug}
            reservationId={reservationId}
            amount={Number(payAmount) || 0}
            size="sm"
            label="Paystack"
            onSuccess={() => void reload()}
          />
        ) : (
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => void quickPay()}>
            Post cash
          </Button>
        )}
        <Link
          href={`/hms/${slug}/frontdesk/folio?reservationId=${reservationId}`}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Open full folio
        </Link>
      </div>
    </div>
  );
}
