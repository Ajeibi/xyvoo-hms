"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FolioLineRow } from "@/lib/hms/folio";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { requestNotificationsRefresh } from "@/lib/hms/notifications-bus";
import { PaystackCaptureButton, PaystackChargeButton } from "@/components/hms/payments/PaystackChargeButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut, Loader2, Search } from "lucide-react";

type SearchHit = {
  reservationId: string;
  confirmationCode: string;
  folioNumber: string;
  status: string;
  roomCode: string | null;
  guestName: string;
};

type Step = "find" | "settle";

export function FrontDeskCheckoutDialog({
  slug,
  currency,
  open,
  onOpenChange,
  initialRoomCode,
  initialReservationId,
}: {
  slug: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialRoomCode?: string;
  initialReservationId?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("find");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [reservationId, setReservationId] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [guestName, setGuestName] = useState("");
  const [folioNumber, setFolioNumber] = useState("");
  const [lines, setLines] = useState<FolioLineRow[]>([]);
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [paystackEnabled, setPaystackEnabled] = useState(false);
  const [cardPayAmount, setCardPayAmount] = useState("");
  const [manualPayAmount, setManualPayAmount] = useState("");
  const [manualMethod, setManualMethod] = useState("cash");
  const [overrideBalance, setOverrideBalance] = useState(false);
  const [cashFloatActive, setCashFloatActive] = useState<boolean | null>(null);

  const reset = useCallback(() => {
    setStep("find");
    setQuery("");
    setHits([]);
    setReservationId("");
    setRoomCode("");
    setGuestName("");
    setFolioNumber("");
    setLines([]);
    setBalance(0);
    setError(null);
    setManualPayAmount("");
    setOverrideBalance(false);
    setCashFloatActive(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    fetch(`/api/hotel/paystack?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setPaystackEnabled(Boolean(d.setup?.enabled && d.setup?.publicKey)))
      .catch(() => setPaystackEnabled(false));

    if (initialReservationId) {
      setReservationId(initialReservationId);
      setStep("settle");
    } else if (initialRoomCode) {
      setQuery(initialRoomCode);
      setRoomCode(initialRoomCode);
    }
  }, [open, slug, initialReservationId, initialRoomCode, reset]);

  const loadFolio = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/hotel/folio?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(id)}`,
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Could not load folio.");
          return;
        }
        if (data.reservation.status !== "checked_in") {
          setError("This stay is not checked in — nothing to check out.");
          setStep("find");
          return;
        }
        setReservationId(id);
        setFolioNumber(data.reservation.folioNumber);
        setLines(data.folio.lines);
        setBalance(data.folio.balance);
        setCardPayAmount(String(Math.max(0, data.folio.balance).toFixed(2)));
        setManualPayAmount(data.folio.balance > 0 ? String(data.folio.balance.toFixed(2)) : "");
        setStep("settle");

        const adjRes = await fetch("/api/hotel/folio/early-checkout-adjustment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, reservationId: id }),
        });
        const adjData = await adjRes.json().catch(() => ({}));
        if (adjRes.ok && adjData.folio) {
          setLines(adjData.folio.lines ?? data.folio.lines);
          const bal = Number(adjData.folio.balance) || 0;
          setBalance(bal);
          setCardPayAmount(String(Math.max(0, bal).toFixed(2)));
          setManualPayAmount(bal > 0 ? String(bal.toFixed(2)) : "");
        }
      } finally {
        setLoading(false);
      }
    },
    [slug],
  );

  useEffect(() => {
    if (open && initialReservationId && step === "settle" && !folioNumber) {
      void loadFolio(initialReservationId);
    }
  }, [open, initialReservationId, step, folioNumber, loadFolio]);

  useEffect(() => {
    if (!open || step !== "settle") return;
    fetch(`/api/hotel/folio/cash-float?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setCashFloatActive(Boolean(d.session)))
      .catch(() => setCashFloatActive(null));
  }, [open, step, slug, balance]);

  const search = async (q?: string) => {
    const term = (q ?? query).trim();
    if (!term) return;
    setSearching(true);
    setError(null);
    setHits([]);
    try {
      const res = await fetch(
        `/api/hotel/folio/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(term)}&inHouse=1`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Search failed.");
        return;
      }
      const results = (data.results ?? []) as SearchHit[];
      setHits(results);
      if (results.length === 1) {
        const hit = results[0]!;
        setGuestName(hit.guestName);
        setRoomCode(hit.roomCode ?? term);
        await loadFolio(hit.reservationId);
      } else if (results.length === 0) {
        setError("No in-house guest found for that room, name, or reference.");
      }
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (open && initialRoomCode && !initialReservationId && !folioNumber) {
      void search(initialRoomCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when dialog opens with room
  }, [open, initialRoomCode, initialReservationId]);

  const postManualPayment = async () => {
    const amount = Number(manualPayAmount);
    if (!amount || amount <= 0) return true;
    const res = await fetch("/api/hotel/folio/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, reservationId, amount, method: manualMethod }),
    });
    const data = await res.json();
    if (!res.ok) {
      toastError("Payment failed", data.error ?? "Try again.");
      return false;
    }
    if (data.cashFloatAutoOpened) {
      setCashFloatActive(true);
      toastSuccess("Cash float opened", "Drawer session started for this shift.");
    }
    toastSuccess("Payment recorded");
    await loadFolio(reservationId);
    return true;
  };

  const completeCheckout = async () => {
    setLoading(true);
    setError(null);
    try {
      if (Number(manualPayAmount) > 0) {
        const paid = await postManualPayment();
        if (!paid) return;
      }
      const res = await fetch("/api/hotel/frontdesk/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          reservationId,
          roomCode: roomCode || undefined,
          overrideBalance,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          data.balance != null ? `${data.error} (${data.balance})` : data.error ?? "Checkout failed.";
        setError(msg);
        toastError("Checkout failed", msg);
        await loadFolio(reservationId);
        return;
      }
      toastSuccess(
        roomCode ? `Room ${roomCode} checked out` : "Guest checked out successfully",
        "Room released and marked for housekeeping.",
      );
      onOpenChange(false);
      router.replace(`/hms/${slug}/frontdesk`);
      router.refresh();
      requestNotificationsRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,calc(100vh-2rem))] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5 pr-12">
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-5 w-5 text-orange-600" />
            Check out guest
          </DialogTitle>
          <DialogDescription>
            {step === "find"
              ? "Enter a room number, guest name, or confirmation to find the stay."
              : `Settle the folio and release the room${roomCode ? ` (${roomCode})` : ""}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {step === "find" ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Room, guest name, or confirmation…"
                  className="h-11 rounded-xl"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void search();
                  }}
                />
                <Button
                  type="button"
                  className="h-11 shrink-0 rounded-xl px-4"
                  disabled={searching || !query.trim()}
                  onClick={() => void search()}
                >
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Search className="h-4 w-4" aria-hidden />
                  )}
                  {searching ? "Finding…" : "Find"}
                </Button>
              </div>
              {hits.length > 1 ? (
                <ul className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                  {hits.map((h) => (
                    <li key={h.reservationId}>
                      <button
                        type="button"
                        className="w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white"
                        onClick={() => {
                          setGuestName(h.guestName);
                          setRoomCode(h.roomCode ?? "");
                          void loadFolio(h.reservationId);
                        }}
                      >
                        <span className="font-medium text-slate-900">{h.guestName}</span>
                        <span className="mt-0.5 block text-slate-500">
                          {h.roomCode ? `Room ${h.roomCode}` : "No room"} · {h.confirmationCode}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">{guestName || "Guest"}</p>
                <p className="text-slate-600">
                  Folio {folioNumber}
                  {roomCode ? ` · Room ${roomCode}` : ""}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                  {formatPricingAmount(balance, currency)}
                </p>
                <p className="text-xs text-slate-500">Balance due</p>
              </div>

              {lines.filter((l) => !l.voided_at).length > 0 ? (
                <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-100 text-sm">
                  <table className="w-full">
                    <tbody>
                      {lines
                        .filter((l) => !l.voided_at)
                        .map((l) => (
                          <tr key={l.id} className="border-t border-slate-50 first:border-0">
                            <td className="px-3 py-2 text-slate-700">{l.description ?? l.kind}</td>
                            <td className="px-3 py-2 text-right tabular-nums">
                              {formatPricingAmount(l.amount, currency)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {balance > 0.01 ? (
                <div className="space-y-3">
                  {paystackEnabled ? (
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
                          size="sm"
                          onSuccess={() => void loadFolio(reservationId)}
                        />
                        <PaystackCaptureButton
                          slug={slug}
                          reservationId={reservationId}
                          amount={Number(cardPayAmount) || 0}
                          onSuccess={() => void loadFolio(reservationId)}
                        />
                      </div>
                    </div>
                  ) : null}
                  <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                    <p className="text-sm font-medium text-slate-900">Cash / POS payment</p>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={manualPayAmount}
                      onChange={(e) => setManualPayAmount(e.target.value)}
                    />
                    <select
                      className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm"
                      value={manualMethod}
                      onChange={(e) => setManualMethod(e.target.value)}
                    >
                      <option value="cash">Cash</option>
                      <option value="pos">POS terminal</option>
                      <option value="direct_bill">Direct bill</option>
                    </select>
                    {manualMethod === "cash" ? (
                      <p className="text-xs text-slate-500">
                        {cashFloatActive
                          ? "Cash float session is open for this shift."
                          : "No cash float yet — one will open automatically when you post this payment."}
                      </p>
                    ) : manualMethod === "pos" ? (
                      <p className="text-xs text-slate-500">
                        POS payments post to the folio without a cash drawer session.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  Folio is settled — ready to check out.
                </p>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={overrideBalance}
                  onChange={(e) => setOverrideBalance(e.target.checked)}
                />
                Manager override open balance
              </label>
            </div>
          )}

          {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
          {step === "settle" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("find")} disabled={loading}>
                Back
              </Button>
              <Button type="button" disabled={loading || !reservationId} onClick={() => void completeCheckout()}>
                {loading ? "Processing…" : "Complete checkout"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
