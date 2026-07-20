"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FolioLineRow } from "@/lib/hms/folio";
import type { FbOrderWithItems } from "@/lib/hms/fb-types";
import { formatCurrencySymbol, formatPricingAmount } from "@/lib/hms/room-pricing";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { requestNotificationsRefresh } from "@/lib/hms/notifications-bus";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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

/** All F&B folio charges are posted with this exact description shape. */
function extractFbOrderNumber(line: FolioLineRow): string | null {
  if (line.reference) return line.reference;
  const match = line.description ? /F&B order (\S+)/.exec(line.description) : null;
  return match?.[1] ?? null;
}

/** Keeps the amount editable while showing it grouped with commas, e.g. 264,500.00 */
function formatAmountInputValue(raw: string) {
  if (!raw) return "";
  const [intPart, decPart] = raw.split(".");
  const digits = intPart.replace(/[^0-9]/g, "");
  if (!digits) return decPart !== undefined ? `.${decPart}` : "";
  const formattedInt = Number(digits).toLocaleString("en-NG");
  return decPart !== undefined ? `${formattedInt}.${decPart}` : formattedInt;
}

function parseAmountInputValue(formatted: string) {
  return formatted.replace(/,/g, "").replace(/[^0-9.]/g, "");
}

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
  const [roomTypeName, setRoomTypeName] = useState<string | null>(null);
  const [fbOrdersByNumber, setFbOrdersByNumber] = useState<Map<string, FbOrderWithItems>>(new Map());
  const [lines, setLines] = useState<FolioLineRow[]>([]);
  const [balance, setBalance] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [manualPayAmount, setManualPayAmount] = useState("");
  const [manualMethod, setManualMethod] = useState("cash");
  const [overrideBalance, setOverrideBalance] = useState(false);
  const [cashFloatActive, setCashFloatActive] = useState<boolean | null>(null);
  const [confirmOverrideOpen, setConfirmOverrideOpen] = useState(false);

  const reset = useCallback(() => {
    setStep("find");
    setQuery("");
    setHits([]);
    setReservationId("");
    setRoomCode("");
    setGuestName("");
    setFolioNumber("");
    setRoomTypeName(null);
    setFbOrdersByNumber(new Map());
    setLines([]);
    setBalance(0);
    setError(null);
    setManualPayAmount("");
    setOverrideBalance(false);
    setCashFloatActive(null);
    setConfirmOverrideOpen(false);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }

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
        const [res, fbRes] = await Promise.all([
          fetch(
            `/api/hotel/folio?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(id)}`,
          ),
          fetch(
            `/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(id)}&status=open,sent_to_kitchen,ready,closed,voided`,
          ),
        ]);
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
        setGuestName(data.reservation.guestName ?? "");
        setFolioNumber(data.reservation.folioNumber);
        setRoomTypeName(data.reservation.roomTypeName ?? null);
        setLines(data.folio.lines);
        setBalance(data.folio.balance);
        setManualPayAmount(data.folio.balance > 0 ? String(data.folio.balance.toFixed(2)) : "");
        setStep("settle");

        const fbData = await fbRes.json().catch(() => ({}));
        if (fbRes.ok) {
          const map = new Map<string, FbOrderWithItems>();
          for (const order of (fbData.orders ?? []) as FbOrderWithItems[]) {
            map.set(order.order_number, order);
          }
          setFbOrdersByNumber(map);
        }

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
    setSubmitting(true);
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
      router.refresh();
      requestNotificationsRefresh();
    } finally {
      setSubmitting(false);
    }
  };

  const paymentNow = Number(manualPayAmount) || 0;
  const remainingAfterPayment = Math.max(0, balance - paymentNow);

  const handleCompleteClick = () => {
    if (overrideBalance && remainingAfterPayment > 0.01) {
      setConfirmOverrideOpen(true);
      return;
    }
    void completeCheckout();
  };

  return (
    <>
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
          ) : loading && !folioNumber ? (
            <CheckoutSettleSkeleton />
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">{guestName || "Guest"}</p>
                <p className="text-slate-600">
                  Folio {folioNumber}
                  {roomCode ? ` · Room ${roomCode}` : ""}
                  {roomTypeName ? ` · ${roomTypeName}` : ""}
                </p>
                <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                  {formatPricingAmount(balance, currency)}
                </p>
                <p className="text-xs text-slate-500">Balance due</p>
              </div>

              {(() => {
                const activeLines = lines.filter((l) => !l.voided_at);
                const roomLines = activeLines.filter((l) => l.department === "rooms");
                const fbLines = activeLines.filter((l) => l.department === "food_beverage");
                const otherLines = activeLines.filter(
                  (l) => l.department !== "rooms" && l.department !== "food_beverage",
                );

                return (
                  <>
                    {roomLines.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-slate-100 text-sm">
                        <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Room{roomTypeName ? ` — ${roomTypeName}` : ""}
                        </p>
                        <table className="w-full">
                          <tbody>
                            {roomLines.map((l) => (
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

                    {fbLines.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-slate-100 text-sm">
                        <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Food &amp; Beverage
                        </p>
                        <Accordion type="multiple" className="px-2">
                          {fbLines.map((l) => {
                            const orderNumber = extractFbOrderNumber(l);
                            const order = orderNumber ? fbOrdersByNumber.get(orderNumber) : undefined;
                            return (
                              <AccordionItem key={l.id} value={l.id} className="border-slate-100">
                                <AccordionTrigger className="py-2 hover:no-underline">
                                  <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                                    <span className="truncate text-slate-700">
                                      {l.description ?? l.kind}
                                    </span>
                                    <span className="shrink-0 tabular-nums text-slate-900">
                                      {formatPricingAmount(l.amount, currency)}
                                    </span>
                                  </span>
                                </AccordionTrigger>
                                <AccordionContent>
                                  {order && order.items.length > 0 ? (
                                    <ul className="space-y-1 text-xs text-slate-600">
                                      {order.items
                                        .filter((item) => item.kitchen_status !== "voided")
                                        .map((item) => (
                                          <li key={item.id} className="flex justify-between gap-2">
                                            <span className="min-w-0 truncate">
                                              {item.quantity}× {item.name_snapshot}
                                            </span>
                                            <span className="shrink-0 tabular-nums">
                                              {formatPricingAmount(
                                                item.price_snapshot * item.quantity,
                                                currency,
                                              )}
                                            </span>
                                          </li>
                                        ))}
                                    </ul>
                                  ) : (
                                    <p className="text-xs text-slate-400">Order details unavailable.</p>
                                  )}
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      </div>
                    ) : null}

                    {otherLines.length > 0 ? (
                      <div className="overflow-hidden rounded-xl border border-slate-100 text-sm">
                        <p className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Other
                        </p>
                        <table className="w-full">
                          <tbody>
                            {otherLines.map((l) => (
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
                  </>
                );
              })()}

              {balance > 0.01 ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 p-4 space-y-2">
                    <p className="text-sm font-medium text-slate-900">Cash / POS payment</p>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">
                        {formatCurrencySymbol(currency)}
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="pl-8 tabular-nums"
                        value={formatAmountInputValue(manualPayAmount)}
                        onChange={(e) => setManualPayAmount(parseAmountInputValue(e.target.value))}
                      />
                    </div>
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
              <Button type="button" variant="outline" onClick={() => setStep("find")} disabled={loading || submitting}>
                Back
              </Button>
              <Button
                type="button"
                disabled={loading || submitting || !reservationId || !folioNumber}
                onClick={handleCompleteClick}
              >
                {submitting ? "Processing…" : "Complete checkout"}
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

    <AlertDialog open={confirmOverrideOpen} onOpenChange={setConfirmOverrideOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Check out with an unpaid balance?</AlertDialogTitle>
          <AlertDialogDescription>
            {guestName || "This guest"}
            {roomCode ? ` (Room ${roomCode})` : ""} will be checked out under manager override.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Balance due</span>
            <span className="font-medium tabular-nums text-slate-900">
              {formatPricingAmount(balance, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-500">Paid now</span>
            <span className="font-medium tabular-nums text-slate-900">
              {formatPricingAmount(paymentNow, currency)}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 pt-2">
            <span className="font-medium text-red-700">Waived (left unpaid)</span>
            <span className="font-semibold tabular-nums text-red-700">
              {formatPricingAmount(remainingAfterPayment, currency)}
            </span>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => void completeCheckout()}>
            Check out anyway
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function CheckoutSettleSkeleton() {
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <Skeleton className="h-4 w-32 bg-slate-200" />
        <Skeleton className="h-3.5 w-48 bg-slate-200" />
        <Skeleton className="mt-1 h-7 w-28 bg-slate-200" />
        <Skeleton className="h-3 w-20 bg-slate-200" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-100">
        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2">
          <Skeleton className="h-3 w-16 bg-slate-200" />
        </div>
        <div className="space-y-2 p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-32 bg-slate-200" />
            <Skeleton className="h-3.5 w-16 bg-slate-200" />
          </div>
          <div className="flex items-center justify-between">
            <Skeleton className="h-3.5 w-24 bg-slate-200" />
            <Skeleton className="h-3.5 w-16 bg-slate-200" />
          </div>
        </div>
      </div>
      <div className="space-y-2 rounded-xl border border-slate-200 p-4">
        <Skeleton className="h-3.5 w-36 bg-slate-200" />
        <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
        <Skeleton className="h-10 w-full rounded-md bg-slate-200" />
      </div>
    </div>
  );
}
