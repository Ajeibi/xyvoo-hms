"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, Banknote, BedDouble, Check, Flame, Loader2, Search, Send } from "lucide-react";
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
import { HmsAlert, HmsEmptyState, HmsField, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsFilterChips } from "@/components/hms/hms-ui-client";

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
  { key: "ready_to_serve", label: "Ready to serve" },
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
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Restaurant & bar"
        meaning="food"
        title="Open orders"
        description="See where each order is in the kitchen, then take payment or charge it to a room."
      />

      <div className="max-w-md rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
        <HmsField
          id="fb-orders-reservation-id"
          label="Reservation ID for an in-house guest"
          optional
          hint="Leave blank to close a walk-in order at the PoS."
        >
          <input
            id="fb-orders-reservation-id"
            value={reservationId}
            onChange={(e) => setReservationId(e.target.value)}
            aria-describedby="fb-orders-reservation-id-hint"
            className={hmsInput}
          />
        </HmsField>
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
                  <label htmlFor="fb-orders-cancel-reason" className="mb-1 block text-sm font-medium text-slate-800">
                    Reason <span className="font-normal text-slate-600">(optional)</span>
                  </label>
                  <Input
                    id="fb-orders-cancel-reason"
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
            <div className="rounded-xl bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-emerald-900">
                Amount to charge
              </p>
              <p className="text-2xl font-bold tabular-nums text-slate-900">
                {chargeTarget ? formatPricingAmount(chargeTarget.subtotal, currency) : ""}
              </p>
            </div>

            <label htmlFor="fb-orders-charge-search" className="-mb-2 block text-sm font-medium text-slate-800">
              Room number or guest name
            </label>
            <div className="flex gap-2">
              <Input
                id="fb-orders-charge-search"
                value={chargeQuery}
                onChange={(e) => setChargeQuery(e.target.value)}
                placeholder="e.g. 204 or Smith"
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
                      aria-pressed={chargeSelected?.reservationId === hit.reservationId}
                      className={cn(
                        "w-full rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
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

            <HmsAlert message={chargeError ?? ""} />
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
                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-900">
                    Amount due
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">
                    {payTarget ? formatPricingAmount(payTarget.subtotal, currency) : ""}
                  </p>
                  <p className="text-slate-700">
                    #{payTarget?.order_number}
                    {reservationId.trim() ? "" : " · Walk-in"}
                  </p>
                </div>
                <div>
                  <p id="fb-orders-pay-method" className="mb-2 text-sm font-medium text-slate-800">Payment method</p>
                  <div role="group" aria-labelledby="fb-orders-pay-method" className="flex gap-2">
                    <button
                      type="button"
                      aria-pressed={payMethod === "cash"}
                      disabled={paySheetBusy}
                      onClick={() => setPayMethod("cash")}
                      className={cn(
                        "min-h-11 flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        payMethod === "cash"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50",
                      )}
                    >
                      Cash
                    </button>
                    <button
                      type="button"
                      aria-pressed={payMethod === "pos"}
                      disabled={paySheetBusy}
                      onClick={() => setPayMethod("pos")}
                      className={cn(
                        "min-h-11 flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        payMethod === "pos"
                          ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                          : "border-slate-200 text-slate-700 hover:bg-slate-50",
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

      <HmsFilterChips<OrderStage | "all">
        label="Show orders by stage"
        meaning="food"
        value={stageFilter}
        onChange={setStageFilter}
        options={[
          { value: "all", label: "All", count: orders.length },
          ...ORDER_STAGE_OPTIONS.map((option) => ({
            value: option.key,
            label: option.label,
            count: stageCounts[option.key],
          })),
        ]}
      />

      <div className="space-y-3">
        {visibleOrders.length === 0 ? (
          orders.length === 0 ? (
            <HmsEmptyState
              art="basket"
              meaning="food"
              title="No open orders"
              description="Orders taken on the POS appear here until they're paid or charged to a room."
            />
          ) : (
            <HmsEmptyState
              art="basket"
              meaning="food"
              title="No orders at this stage"
              description="Choose another stage, or All, to see the rest."
            />
          )
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
                    <p className="flex flex-wrap items-center gap-2 font-heading text-base font-semibold text-slate-900">
                      #{order.order_number}
                      {order.rush ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-bold text-rose-800 ring-1 ring-rose-200">
                          <Flame className="h-3.5 w-3.5" aria-hidden />
                          Rush
                        </span>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate-700">
                      {order.table_code ?? order.tab_label ?? order.outlet_name}
                      {notSent ? " · Not sent to kitchen" : ` · ${order.status.replace(/_/g, " ")}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <p className="font-heading text-lg font-bold tabular-nums text-slate-900">
                      {formatPricingAmount(order.subtotal, currency)}
                    </p>
                    {notSent ? (
                      <HmsPill tone="amber">Waiting to be sent to the kitchen</HmsPill>
                    ) : fullyServed ? (
                      <HmsPill tone="blue">Served · {waitLabel}</HmsPill>
                    ) : inKitchen ? (
                      kitchenDone ? (
                        <HmsPill tone="green">Kitchen ready · {waitLabel}</HmsPill>
                      ) : overdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                          <AlarmClock className="h-3.5 w-3.5" aria-hidden />
                          Overdue · {waitLabel}
                        </span>
                      ) : (
                        <HmsPill tone="slate">Kitchen wait · {waitLabel}</HmsPill>
                      )
                    ) : null}
                    {alreadyPaid ? (
                      <HmsPill tone="green">Paid · {formatSettlementMethod(order.settlement_method as string)}</HmsPill>
                    ) : null}
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-800">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2">
                      <span>
                        {item.quantity}× {item.name_snapshot}
                      </span>
                      <HmsPill
                        tone={
                          item.kitchen_status === "served"
                            ? "blue"
                            : item.kitchen_status === "ready"
                              ? "green"
                              : item.kitchen_status === "voided"
                                ? "red"
                                : "slate"
                        }
                      >
                        {formatItemKitchenStatus(item.kitchen_status)}
                      </HmsPill>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {notSent ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => void sendToKitchen(order.id)}
                      className={hmsButton.primary}
                    >
                      {sendLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Send className="h-4 w-4" aria-hidden />
                      )}
                      Send to kitchen
                    </button>
                  ) : null}
                  {showMarkServed ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => void markServed(order.id, order.order_number)}
                      className={hmsButton.primary}
                    >
                      {serveLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Check className="h-4 w-4" aria-hidden />
                      )}
                      Mark as served
                    </button>
                  ) : null}
                  {!alreadyPaid ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => openChargeSheet(order)}
                      className={hmsButton.secondary}
                    >
                      {chargeLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <BedDouble className="h-4 w-4 text-sky-700" aria-hidden />
                      )}
                      Charge {formatPricingAmount(order.subtotal, currency)} to room
                    </button>
                  ) : null}
                  {!alreadyPaid ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => openPaySheet(order)}
                      className={hmsButton.secondary}
                    >
                      {posLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Banknote className="h-4 w-4 text-emerald-600" aria-hidden />
                      )}
                      PoS / Cash · {formatPricingAmount(order.subtotal, currency)}
                    </button>
                  ) : null}
                  {canCancel ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => setCancelTarget(order)}
                      className={cn(hmsButton.danger, "min-h-10")}
                    >
                      {cancelLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : null}
                      Cancel order
                    </button>
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
