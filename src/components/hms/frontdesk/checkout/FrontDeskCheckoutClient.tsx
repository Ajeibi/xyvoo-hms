"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FolioLineRow } from "@/lib/hms/folio";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { requestNotificationsRefresh } from "@/lib/hms/notifications-bus";
import { PaystackCaptureButton, PaystackChargeButton } from "@/components/hms/payments/PaystackChargeButton";

export function FrontDeskCheckoutClient({
  slug,
  currency,
  initialReservationId,
}: {
  slug: string;
  currency: string;
  initialReservationId?: string;
}) {
  const router = useRouter();
  const [reservationId, setReservationId] = useState(initialReservationId ?? "");
  const [roomCode, setRoomCode] = useState("");
  const [folio, setFolio] = useState<{
    lines: FolioLineRow[];
    balance: number;
    folioNumber: string;
    guestName?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [cardPayAmount, setCardPayAmount] = useState("");

  const loadFolio = useCallback(async () => {
    if (!reservationId) return;
    const res = await fetch(
      `/api/hotel/folio?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(reservationId)}`,
    );
    if (res.ok) {
      const data = await res.json();
      setFolio({
        lines: data.folio.lines,
        balance: data.folio.balance,
        folioNumber: data.reservation.folioNumber,
      });
    }
  }, [slug, reservationId]);

  useEffect(() => {
    if (initialReservationId) void loadFolio();
  }, [initialReservationId, loadFolio]);

  const search = async () => {
    const q = roomCode.trim() || reservationId;
    if (!q) return;
    const res = await fetch(
      `/api/hotel/folio/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(q)}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { results: { reservationId: string; guestName: string }[] };
      if (data.results[0]) {
        setReservationId(data.results[0].reservationId);
        setFolio(null);
      }
    }
  };

  useEffect(() => {
    if (reservationId) void loadFolio();
  }, [reservationId, loadFolio]);

  useEffect(() => {
    fetch(`/api/hotel/paystack?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setPaystackEnabled(Boolean(d.setup?.enabled && d.setup?.publicKey)))
      .catch(() => setPaystackEnabled(false));
  }, [slug]);

  useEffect(() => {
    if (folio?.balance != null && folio.balance > 0) {
      setCardPayAmount(String(folio.balance.toFixed(2)));
    }
  }, [folio?.balance]);

  const settleAndCheckout = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const payAmount = Number(fd.get("payAmount"));
    const method = String(fd.get("method") ?? "cash");
    if (payAmount > 0 && reservationId && method !== "card") {
      const payRes = await fetch("/api/hotel/folio/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          reservationId,
          amount: payAmount,
          method: fd.get("method"),
        }),
      });
      if (!payRes.ok) {
        const err = (await payRes.json()) as { error?: string };
        const msg = err.error ?? "Payment failed.";
        setError(msg);
        toastError("Payment failed", msg);
        return;
      }
      toastSuccess("Payment recorded");
    }
    const checkoutRes = await fetch("/api/hotel/frontdesk/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId: reservationId || undefined,
        roomCode: roomCode.trim() || undefined,
        overrideBalance: fd.get("overrideBalance") === "on",
      }),
    });
    if (!checkoutRes.ok) {
      const err = (await checkoutRes.json()) as { error?: string; balance?: number };
      const msg = err.balance != null ? `${err.error} (${err.balance})` : err.error ?? "Checkout failed.";
      setError(msg);
      toastError("Checkout failed", msg);
      void loadFolio();
      return;
    }
    toastSuccess(
      "Guest checked out successfully",
      "Room released and marked for housekeeping.",
    );
    router.replace(`/hms/${slug}/frontdesk`);
    router.refresh();
    requestNotificationsRefresh();
  };

  const printReceipt = () => {
    window.print();
  };

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 sm:px-8 print:py-4">
      <Link href={`/hms/${slug}/frontdesk`} className="text-sm text-blue-600 hover:underline print:hidden">
        ← Front desk
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-slate-900">Check-out</h1>
      <p className="mt-1 text-sm text-slate-500 print:hidden">Final folio review and settlement</p>

      <div className="mt-6 flex flex-wrap gap-2 print:hidden">
        <Input value={roomCode} onChange={(e) => setRoomCode(e.target.value)} placeholder="Room code" />
        <Input
          value={reservationId}
          onChange={(e) => setReservationId(e.target.value)}
          placeholder="Reservation ID"
          className="max-w-xs"
        />
        <Button type="button" variant="outline" onClick={() => void search()}>
          Find stay
        </Button>
      </div>

      {folio ? (
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-semibold text-slate-900">Folio {folio.folioNumber}</h2>
          <p className="mt-2 text-2xl font-bold tabular-nums">
            Balance: {formatPricingAmount(folio.balance, currency)}
          </p>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {folio.lines
                .filter((l) => !l.voided_at)
                .map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="py-2">{l.description ?? l.kind}</td>
                    <td className="py-2 text-right tabular-nums">{formatPricingAmount(l.amount, currency)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      ) : null}

      <form onSubmit={settleAndCheckout} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6 print:hidden">
        <h3 className="font-semibold text-slate-900">Settle & check out</h3>
        {paystackEnabled && reservationId && folio && folio.balance > 0 ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2">
            <p className="text-sm font-medium text-slate-900">Pay with Paystack</p>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={cardPayAmount}
              onChange={(e) => setCardPayAmount(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <PaystackChargeButton
                slug={slug}
                reservationId={reservationId}
                amount={Number(cardPayAmount) || 0}
                onSuccess={() => void loadFolio()}
              />
              <PaystackCaptureButton
                slug={slug}
                reservationId={reservationId}
                amount={Number(cardPayAmount) || 0}
                onSuccess={() => void loadFolio()}
              />
            </div>
          </div>
        ) : null}
        <Input name="payAmount" type="number" step="0.01" min="0" placeholder="Manual payment amount (cash/POS)" />
        <select name="method" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm">
          <option value="cash">Cash</option>
          {!paystackEnabled ? <option value="card">Card (manual)</option> : null}
          <option value="pos">POS terminal</option>
          <option value="direct_bill">Direct bill</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="overrideBalance" />
          Manager override open balance
        </label>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit">Complete checkout</Button>
          <Button type="button" variant="outline" onClick={printReceipt}>
            Print receipt
          </Button>
        </div>
      </form>
    </div>
  );
}
