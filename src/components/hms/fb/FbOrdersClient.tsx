"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { ingestFbOrderSnapshot } from "@/lib/hms/fb-status-notifications";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";

const CLOCK_MS = 15_000;

type OrderAction = "charge" | "pos" | "cancel" | "send" | "serve";

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
  const [busy, setBusy] = useState<{ orderId: string; action: OrderAction } | null>(null);
  const [capabilities, setCapabilities] = useState<FbRoleCapabilities | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FbOrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [now] = useClientNow(CLOCK_MS);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (res.ok) {
      setOrders(data.orders ?? []);
      if (data.capabilities) setCapabilities(data.capabilities);
      if (typeof data.kitchenOverdueMinutes === "number") {
        setOverdueMinutes(data.kitchenOverdueMinutes);
      }
      ingestFbOrderSnapshot(slug, data.orders ?? []);
    }
  }, [slug]);

  useFbRealtime(tenantId, () => void load());

  useEffect(() => {
    void load();
  }, [load]);

  const chargeToRoom = async (orderId: string) => {
    if (!reservationId.trim()) {
      toastError("Room charge", "Enter a reservation ID for charge-to-room.");
      return;
    }
    setBusy({ orderId, action: "charge" });
    const res = await fetch(`/api/hotel/fb/orders/${orderId}/folio-charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, reservationId: reservationId.trim() }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toastError("Folio charge failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Posted to folio");
    await load();
  };

  const settlePos = async (orderId: string, amount: number) => {
    if (!reservationId.trim()) {
      setBusy({ orderId, action: "pos" });
      const closeRes = await fetch(`/api/hotel/fb/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "close" }),
      });
      setBusy(null);
      if (!closeRes.ok) {
        const data = await closeRes.json();
        toastError("Close failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Order closed (PoS)");
      await load();
      return;
    }
    setBusy({ orderId, action: "pos" });
    const res = await fetch(`/api/hotel/fb/orders/${orderId}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId: reservationId.trim(),
        amount,
        method: "pos",
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toastError("Payment failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("PoS payment recorded");
    await load();
  };

  const sendToKitchen = async (orderId: string) => {
    setBusy({ orderId, action: "send" });
    const res = await fetch(`/api/hotel/fb/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "send_to_kitchen" }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toastError("Send failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Sent to kitchen");
    await load();
  };

  const markServed = async (orderId: string, orderNumber: string) => {
    setBusy({ orderId, action: "serve" });
    const res = await fetch(`/api/hotel/fb/orders/${orderId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "serve" }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toastError("Could not mark served", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Marked as served", `#${orderNumber}`);
    await load();
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setBusy({ orderId: cancelTarget.id, action: "cancel" });
    const res = await fetch(`/api/hotel/fb/orders/${cancelTarget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        action: "void",
        voidReason: cancelReason.trim() || undefined,
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toastError("Cancel failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Order cancelled", `#${cancelTarget.order_number} removed from kitchen and POS.`);
    setCancelTarget(null);
    setCancelReason("");
    await load();
  };

  const canCancel = capabilities?.canVoidOrder !== false;

  return (
    <div className="w-full space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Open orders</h1>
        <p className="text-sm text-slate-500">Kitchen status and settlement.</p>
      </div>

      <div className="max-w-md">
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Reservation ID (for charge-to-room / in-house PoS)
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
          if (!open && busy?.action !== "cancel") {
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
                    disabled={busy?.action === "cancel"}
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy?.action === "cancel"}>Keep order</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={busy?.action === "cancel"}
              className="gap-1.5"
              onClick={() => void confirmCancel()}
            >
              {busy?.action === "cancel" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : null}
              Cancel order
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">No open orders.</p>
        ) : (
          orders.map((order) => {
            const orderBusy = busy?.orderId === order.id;
            const chargeLoading = orderBusy && busy.action === "charge";
            const posLoading = orderBusy && busy.action === "pos";
            const cancelLoading = orderBusy && busy.action === "cancel";
            const sendLoading = orderBusy && busy.action === "send";
            const serveLoading = orderBusy && busy.action === "serve";
            const notSent = order.status === "open";
            const kitchenDone = isKitchenWorkComplete(order.items);
            const fullyServed = isOrderFullyServed(order.items);
            const showMarkServed = canMarkOrderServed(order);
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
                  <Button
                    type="button"
                    size="sm"
                    disabled={orderBusy}
                    onClick={() => void chargeToRoom(order.id)}
                    className="gap-1.5"
                  >
                    {chargeLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    Charge to room
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={orderBusy}
                    onClick={() => void settlePos(order.id, order.subtotal)}
                    className="gap-1.5"
                  >
                    {posLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    PoS / close
                  </Button>
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
