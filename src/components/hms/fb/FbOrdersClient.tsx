"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import type { FbOrderWithItems } from "@/lib/hms/fb-types";
import type { FbRoleCapabilities } from "@/lib/hms/fb-rbac";
import { DEFAULT_KITCHEN_OVERDUE_MINUTES } from "@/lib/hms/fb-settings";
import {
  canMarkOrderServed,
  formatWaitMinutes,
  hasOpenKitchenItems,
  isKitchenWorkComplete,
  isOrderFullyServed,
  isOrderKitchenOverdue,
  resolveTimingNow,
  ticketAgeStyle,
} from "@/lib/hms/fb-order-timing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { useClientNow } from "@/hooks/useClientNow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";

const CLOCK_MS = 15_000;

type OrderAction = "charge" | "pos" | "cancel" | "send" | "serve";

function busyKey(orderId: string, action: OrderAction) {
  return `${orderId}:${action}`;
}

type RoomChargeHit = {
  reservationId: string;
  confirmationCode: string;
  status: string;
  roomCode: string | null;
  guestName: string;
};

type OrderStage = "not_sent" | "in_kitchen" | "ready_to_serve" | "pending_payment";

const ORDER_STAGE_OPTIONS: { key: OrderStage; label: string }[] = [
  { key: "not_sent", label: "Not sent to kitchen" },
  { key: "in_kitchen", label: "Awaiting kitchen" },
  { key: "ready_to_serve", label: "Ready — pending serve" },
  { key: "pending_payment", label: "Pending payment" },
];

const ORDER_STAGE_ORDER: OrderStage[] = ORDER_STAGE_OPTIONS.map((o) => o.key);

function resolveOrderStage(order: FbOrderWithItems): OrderStage {
  if (order.status === "open") return "not_sent";
  if (isOrderFullyServed(order.items)) return "pending_payment";
  if (isKitchenWorkComplete(order.items)) return "ready_to_serve";
  return "in_kitchen";
}

function formatSettlementMethod(method: string) {
  if (method === "pos") return "PoS terminal";
  if (method === "cash") return "Cash";
  if (method === "card") return "Card";
  if (method === "room_charge") return "Room charge";
  return method;
}

function formatItemKitchenStatus(status: string) {
  if (status === "pending") return "Awaiting kitchen";
  if (status === "preparing") return "Preparing";
  if (status === "ready") return "Ready";
  if (status === "served") return "Served";
  if (status === "voided") return "Cancelled";
  return status;
}

export function FbOrdersClient({
  slug,
  tenantId,
  currency,
  initial,
  kitchenOverdueMinutes: initialOverdueMinutes = DEFAULT_KITCHEN_OVERDUE_MINUTES,
}: {
  slug: string;
  tenantId: string;
  currency: string;
  initial: { orders: FbOrderWithItems[] };
  kitchenOverdueMinutes?: number;
}) {
  const [orders, setOrders] = useState<FbOrderWithItems[]>(initial.orders);
  const [overdueMinutes, setOverdueMinutes] = useState(initialOverdueMinutes);
  const [reservationId, setReservationId] = useState("");
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [capabilities, setCapabilities] = useState<FbRoleCapabilities | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FbOrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [stageFilter, setStageFilter] = useState<OrderStage | "all">("all");
  const [chargeTarget, setChargeTarget] = useState<FbOrderWithItems | null>(null);
  const [chargeQuery, setChargeQuery] = useState("");
  const [chargeHits, setChargeHits] = useState<RoomChargeHit[]>([]);
  const [chargeSearching, setChargeSearching] = useState(false);
  const [chargeSelected, setChargeSelected] = useState<RoomChargeHit | null>(null);
  const [chargeError, setChargeError] = useState<string | null>(null);
  const [payTarget, setPayTarget] = useState<FbOrderWithItems | null>(null);
  const [payMethod, setPayMethod] = useState<"cash" | "pos">("pos");
  const [now] = useClientNow(CLOCK_MS);

  const stageCounts = useMemo(() => {
    const counts: Record<OrderStage, number> = {
      not_sent: 0,
      in_kitchen: 0,
      ready_to_serve: 0,
      pending_payment: 0,
    };
    for (const order of orders) counts[resolveOrderStage(order)] += 1;
    return counts;
  }, [orders]);

  const visibleOrders = useMemo(() => {
    const withStage = orders.map((order) => ({ order, stage: resolveOrderStage(order) }));
    const filtered =
      stageFilter === "all" ? withStage : withStage.filter((entry) => entry.stage === stageFilter);
    return filtered.sort(
      (a, b) => ORDER_STAGE_ORDER.indexOf(a.stage) - ORDER_STAGE_ORDER.indexOf(b.stage),
    );
  }, [orders, stageFilter]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (res.ok) {
      setOrders(data.orders ?? []);
      if (data.capabilities) setCapabilities(data.capabilities);
      if (typeof data.kitchenOverdueMinutes === "number") {
        setOverdueMinutes(data.kitchenOverdueMinutes);
      }
    }
  }, [slug]);

  useFbRealtime(tenantId, () => void load());

  useEffect(() => {
    void load();
  }, [load]);

  const withBusy = async (orderId: string, action: OrderAction, run: () => Promise<void>) => {
    const key = busyKey(orderId, action);
    setBusyKeys((prev) => new Set(prev).add(key));
    try {
      await run();
    } finally {
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const openChargeSheet = (order: FbOrderWithItems) => {
    setChargeTarget(order);
    setChargeQuery("");
    setChargeHits([]);
    setChargeSelected(null);
    setChargeError(null);
  };

  const closeChargeSheet = () => {
    setChargeTarget(null);
    setChargeQuery("");
    setChargeHits([]);
    setChargeSelected(null);
    setChargeError(null);
  };

  const searchChargeGuests = async (q?: string) => {
    const term = (q ?? chargeQuery).trim();
    if (!term) return;
    setChargeSearching(true);
    setChargeError(null);
    setChargeHits([]);
    try {
      const res = await fetch(
        `/api/hotel/folio/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(term)}&inHouse=1`,
      );
      const data = await res.json();
      if (!res.ok) {
        setChargeError(data.error ?? "Search failed.");
        return;
      }
      const allResults = (data.results ?? []) as RoomChargeHit[];
      // A room charge needs both a name and a room — a match with no room assigned
      // can't be posted (there is nothing to charge it to), so hide those.
      const results = allResults.filter((hit) => Boolean(hit.roomCode));
      setChargeHits(results);
      if (results.length === 0) {
        setChargeError(
          allResults.length > 0
            ? "Matches found, but none have a room assigned yet."
            : "No in-house guest found for that room or name.",
        );
      }
    } finally {
      setChargeSearching(false);
    }
  };

  const chargeToRoom = async (orderId: string, targetReservationId: string) => {
    await withBusy(orderId, "charge", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${orderId}/folio-charge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId: targetReservationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChargeError(data.error ?? "Try again.");
        toastError("Folio charge failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Posted to folio", chargeSelected ? `Room ${chargeSelected.roomCode ?? "—"} · ${chargeSelected.guestName}` : undefined);
      closeChargeSheet();
      await load();
    });
  };

  const openPaySheet = (order: FbOrderWithItems) => {
    setPayTarget(order);
    setPayMethod("pos");
  };

  const closePaySheet = () => {
    setPayTarget(null);
  };

  const confirmSettlePos = async () => {
    if (!payTarget) return;
    const order = payTarget;
    const methodLabel = payMethod === "cash" ? "Cash" : "PoS terminal";
    await withBusy(order.id, "pos", async () => {
      if (!reservationId.trim()) {
        const closeRes = await fetch(`/api/hotel/fb/orders/${order.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, action: "close", settlementMethod: payMethod }),
        });
        if (!closeRes.ok) {
          const data = await closeRes.json();
          toastError("Close failed", data.error ?? "Try again.");
          return;
        }
        toastSuccess(`Order closed (${methodLabel})`, formatPricingAmount(order.subtotal, currency));
        closePaySheet();
        await load();
        return;
      }
      const res = await fetch(`/api/hotel/fb/orders/${order.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          reservationId: reservationId.trim(),
          amount: order.subtotal,
          method: payMethod,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Payment failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${methodLabel} payment recorded`, formatPricingAmount(order.subtotal, currency));
      closePaySheet();
      await load();
    });
  };

  const sendToKitchen = async (orderId: string) => {
    await withBusy(orderId, "send", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "send_to_kitchen" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Send failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Sent to kitchen");
      await load();
    });
  };

  const markServed = async (orderId: string, orderNumber: string) => {
    await withBusy(orderId, "serve", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "serve" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Could not mark served", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Marked as served", `#${orderNumber}`);
      await load();
    });
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    const target = cancelTarget;
    await withBusy(target.id, "cancel", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          action: "void",
          voidReason: cancelReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Cancel failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Order cancelled", `#${target.order_number} removed from kitchen and POS.`);
      setCancelTarget(null);
      setCancelReason("");
      await load();
    });
  };

  const canCancel = capabilities?.canVoidOrder !== false;
  const cancelBusy = cancelTarget !== null && busyKeys.has(busyKey(cancelTarget.id, "cancel"));
  const chargeSheetBusy = chargeTarget !== null && busyKeys.has(busyKey(chargeTarget.id, "charge"));
  const paySheetBusy = payTarget !== null && busyKeys.has(busyKey(payTarget.id, "pos"));

  return (
    <div className="w-full space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Open orders</h1>
        <p className="text-sm text-slate-500">Kitchen status and settlement.</p>
      </div>

      <div className="max-w-md">
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Reservation ID (for in-house PoS payment)
        </label>
        <Input
          value={reservationId}
          onChange={(e) => setReservationId(e.target.value)}
          placeholder="Optional — leave blank to close walk-in at PoS"
          className="rounded-xl"
        />
      </div>

      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open && !cancelBusy) {
            setCancelTarget(null);
            setCancelReason("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-slate-600">
                <p>
                  This will void{" "}
                  <span className="font-semibold text-slate-900">
                    #{cancelTarget?.order_number}
                  </span>{" "}
                  and remove it from the kitchen display. This cannot be undone.
                </p>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Reason (optional)
                  </label>
                  <Input
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Guest changed mind"
                    disabled={cancelBusy}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelBusy}>Keep order</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={cancelBusy}
              className="gap-1.5"
              onClick={() => void confirmCancel()}
            >
              {cancelBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Cancel order
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={chargeTarget !== null}
        onOpenChange={(open) => {
          if (!open && !chargeSheetBusy) closeChargeSheet();
        }}
      >
        <SheetContent className="flex flex-col gap-0 p-0">
          <SheetHeader className="border-b border-slate-100">
            <SheetTitle>Charge to room{chargeTarget ? ` — #${chargeTarget.order_number}` : ""}</SheetTitle>
            <SheetDescription>Find the in-house guest to post this charge to.</SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Amount to charge
              </p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {chargeTarget ? formatPricingAmount(chargeTarget.subtotal, currency) : ""}
              </p>
            </div>

            <div className="flex gap-2">
              <Input
                value={chargeQuery}
                onChange={(e) => setChargeQuery(e.target.value)}
                placeholder="Room number or guest name…"
                className="h-11 rounded-xl"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") void searchChargeGuests();
                }}
              />
              <Button
                type="button"
                className="h-11 shrink-0 rounded-xl px-4"
                disabled={chargeSearching || !chargeQuery.trim()}
                onClick={() => void searchChargeGuests()}
              >
                {chargeSearching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Search className="h-4 w-4" aria-hidden />
                )}
                Find
              </Button>
            </div>

            {chargeHits.length > 0 ? (
              <ul className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                {chargeHits.map((hit) => (
                  <li key={hit.reservationId}>
                    <button
                      type="button"
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white",
                        chargeSelected?.reservationId === hit.reservationId &&
                          "bg-white ring-2 ring-blue-500",
                      )}
                      onClick={() => {
                        setChargeSelected(hit);
                        setChargeError(null);
                      }}
                    >
                      <span className="font-medium text-slate-900">
                        Room {hit.roomCode} — {hit.guestName}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {chargeSelected ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm">
                <p className="font-semibold text-slate-900">
                  Room {chargeSelected.roomCode} — {chargeSelected.guestName}
                </p>
                <p className="text-slate-600">Charge will post to this guest&rsquo;s folio.</p>
              </div>
            ) : null}

            {chargeError ? <p className="text-sm text-red-600">{chargeError}</p> : null}
          </div>

          <SheetFooter className="border-t border-slate-100">
            <Button
              type="button"
              disabled={!chargeSelected || chargeSheetBusy}
              className="gap-1.5"
              onClick={() => {
                if (chargeTarget && chargeSelected) {
                  void chargeToRoom(chargeTarget.id, chargeSelected.reservationId);
                }
              }}
            >
              {chargeSheetBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Post {chargeTarget ? formatPricingAmount(chargeTarget.subtotal, currency) : ""} to folio
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={payTarget !== null}
        onOpenChange={(open) => {
          if (!open && !paySheetBusy) closePaySheet();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm payment</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-left text-sm text-slate-600">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                    Amount due
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">
                    {payTarget ? formatPricingAmount(payTarget.subtotal, currency) : ""}
                  </p>
                  <p className="text-slate-500">
                    #{payTarget?.order_number}
                    {reservationId.trim() ? "" : " · Walk-in"}
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-medium text-slate-500">Payment method</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={paySheetBusy}
                      onClick={() => setPayMethod("cash")}
                      className={cn(
                        "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                        payMethod === "cash"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      disabled={paySheetBusy}
                      onClick={() => setPayMethod("pos")}
                      className={cn(
                        "flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors",
                        payMethod === "pos"
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      PoS terminal
                    </button>
                  </div>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={paySheetBusy}>Back</AlertDialogCancel>
            <Button
              type="button"
              disabled={paySheetBusy}
              className="gap-1.5"
              onClick={() => void confirmSettlePos()}
            >
              {paySheetBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Confirm {payTarget ? formatPricingAmount(payTarget.subtotal, currency) : ""}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStageFilter("all")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            stageFilter === "all"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          All ({orders.length})
        </button>
        {ORDER_STAGE_OPTIONS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setStageFilter(option.key)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              stageFilter === option.key
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {option.label} ({stageCounts[option.key]})
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visibleOrders.length === 0 ? (
          <p className="text-sm text-slate-500">
            {orders.length === 0 ? "No open orders." : "No orders in this stage."}
          </p>
        ) : (
          visibleOrders.map(({ order }) => {
            const chargeLoading = busyKeys.has(busyKey(order.id, "charge"));
            const posLoading = busyKeys.has(busyKey(order.id, "pos"));
            const cancelLoading = busyKeys.has(busyKey(order.id, "cancel"));
            const sendLoading = busyKeys.has(busyKey(order.id, "send"));
            const serveLoading = busyKeys.has(busyKey(order.id, "serve"));
            const orderBusy = chargeLoading || posLoading || cancelLoading || sendLoading || serveLoading;
            const notSent = order.status === "open";
            const kitchenDone = isKitchenWorkComplete(order.items);
            const fullyServed = isOrderFullyServed(order.items);
            const showMarkServed = canMarkOrderServed(order);
            // Paid before the kitchen finished — settlement_method is set but the
            // order hasn't closed yet (it's still on the kitchen board). Don't
            // offer to charge/pay it again.
            const alreadyPaid = Boolean(order.settlement_method);
            const timingNow = resolveTimingNow(now, order.sent_to_kitchen_at, order.created_at);
            const waitLabel = formatWaitMinutes(
              order.sent_to_kitchen_at,
              order.created_at,
              timingNow,
            );
            const inKitchen =
              Boolean(order.sent_to_kitchen_at) ||
              order.status === "sent_to_kitchen" ||
              order.status === "ready";
            const orderThreshold = order.category_overdue_minutes ?? overdueMinutes;
            const overdue =
              inKitchen &&
              !fullyServed &&
              isOrderKitchenOverdue(
                order.sent_to_kitchen_at,
                order.created_at,
                timingNow,
                hasOpenKitchenItems(order.items),
                orderThreshold,
              );

            return (
              <div
                key={order.id}
                style={
                  inKitchen && !fullyServed
                    ? ticketAgeStyle(order.sent_to_kitchen_at, order.created_at, timingNow, {
                        kitchenComplete: kitchenDone,
                        overdueMinutes: orderThreshold,
                      })
                    : undefined
                }
                className={cn(
                  "rounded-2xl border-2 p-4 shadow-sm transition-[background-color,border-color] duration-500",
                  !inKitchen && "border-slate-200 bg-white",
                  fullyServed && "border-blue-200 bg-blue-50/40",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      #{order.order_number}
                      {order.rush ? (
                        <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">
                          RUSH
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-500">
                      {order.table_code ?? order.tab_label ?? order.outlet_name}
                      {notSent ? " · Not sent to kitchen" : ` · ${order.status.replace(/_/g, " ")}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-lg font-bold tabular-nums">
                      {formatPricingAmount(order.subtotal, currency)}
                    </p>
                    {notSent ? (
                      <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                        Awaiting send to kitchen
                      </span>
                    ) : fullyServed ? (
                      <span className="rounded-lg bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">
                        Served · {waitLabel}
                      </span>
                    ) : inKitchen ? (
                      <span
                        className={cn(
                          "rounded-lg px-2 py-0.5 text-xs font-bold tabular-nums",
                          kitchenDone
                            ? "bg-emerald-600 text-white"
                            : overdue
                              ? "bg-red-600 text-white"
                              : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {kitchenDone ? `Kitchen ready · ${waitLabel}` : `Kitchen wait · ${waitLabel}`}
                      </span>
                    ) : null}
                    {alreadyPaid ? (
                      <span className="rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">
                        Paid · {formatSettlementMethod(order.settlement_method as string)}
                      </span>
                    ) : null}
                  </div>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity}× {item.name_snapshot}
                        <span
                          className={cn(
                            "ml-2 text-xs",
                            item.kitchen_status === "served"
                              ? "font-medium text-blue-600"
                              : item.kitchen_status === "ready"
                                ? "font-medium text-emerald-600"
                                : "text-slate-400",
                          )}
                        >
                          {formatItemKitchenStatus(item.kitchen_status)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {notSent ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={orderBusy}
                      onClick={() => void sendToKitchen(order.id)}
                      className="gap-1.5"
                    >
                      {sendLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      Send to kitchen
                    </Button>
                  ) : null}
                  {showMarkServed ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={orderBusy}
                      onClick={() => void markServed(order.id, order.order_number)}
                      className="gap-1.5 bg-blue-600 hover:bg-blue-700"
                    >
                      {serveLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      Mark as served
                    </Button>
                  ) : null}
                  {!alreadyPaid ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={orderBusy}
                      onClick={() => openChargeSheet(order)}
                      className="gap-1.5"
                    >
                      {chargeLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      Charge {formatPricingAmount(order.subtotal, currency)} to room
                    </Button>
                  ) : null}
                  {!alreadyPaid ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={orderBusy}
                      onClick={() => openPaySheet(order)}
                      className="gap-1.5"
                    >
                      {posLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      PoS / Cash · {formatPricingAmount(order.subtotal, currency)}
                    </Button>
                  ) : null}
                  {canCancel ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={orderBusy}
                      onClick={() => setCancelTarget(order)}
                      className="gap-1.5"
                    >
                      {cancelLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : null}
                      Cancel order
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
