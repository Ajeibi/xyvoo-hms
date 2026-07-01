"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { FbOrderWithItems } from "@/lib/hms/fb-types";
import type { FbRoleCapabilities } from "@/lib/hms/fb-rbac";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFbRealtime } from "@/hooks/useFbRealtime";
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
import { toastError, toastSuccess } from "@/lib/app-toast";

type OrderAction = "charge" | "cash" | "cancel";

export function FbOrdersClient({
  slug,
  tenantId,
  currency,
  initial,
}: {
  slug: string;
  tenantId: string;
  currency: string;
  initial: { orders: FbOrderWithItems[] };
}) {
  const [orders, setOrders] = useState<FbOrderWithItems[]>(initial.orders);
  const [reservationId, setReservationId] = useState("");
  const [busy, setBusy] = useState<{ orderId: string; action: OrderAction } | null>(null);
  const [capabilities, setCapabilities] = useState<FbRoleCapabilities | null>(null);
  const [cancelTarget, setCancelTarget] = useState<FbOrderWithItems | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (res.ok) {
      setOrders(data.orders ?? []);
      if (data.capabilities) setCapabilities(data.capabilities);
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

  const payCash = async (orderId: string, amount: number) => {
    if (!reservationId.trim()) {
      setBusy({ orderId, action: "cash" });
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
      toastSuccess("Order closed (walk-in cash)");
      await load();
      return;
    }
    setBusy({ orderId, action: "cash" });
    const res = await fetch(`/api/hotel/fb/orders/${orderId}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId: reservationId.trim(),
        amount,
        method: "cash",
      }),
    });
    const data = await res.json();
    setBusy(null);
    if (!res.ok) {
      toastError("Payment failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Cash payment recorded");
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
    <div className="mx-auto max-w-[1100px] space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Open orders</h1>
        <p className="text-sm text-slate-500">Kitchen status and settlement.</p>
      </div>

      <div className="max-w-md">
        <label className="mb-1 block text-xs font-medium text-slate-500">
          Reservation ID (for charge-to-room / in-house cash)
        </label>
        <Input
          value={reservationId}
          onChange={(e) => setReservationId(e.target.value)}
          placeholder="Optional — leave blank to close walk-in cash"
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
            const cashLoading = orderBusy && busy.action === "cash";
            const cancelLoading = orderBusy && busy.action === "cancel";

            return (
              <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4">
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
                      {order.table_code ?? order.tab_label ?? order.outlet_name} · {order.status}
                    </p>
                  </div>
                  <p className="text-lg font-bold tabular-nums">
                    {formatPricingAmount(order.subtotal, currency)}
                  </p>
                </div>
                <ul className="mt-3 space-y-1 text-sm text-slate-700">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex justify-between">
                      <span>
                        {item.quantity}× {item.name_snapshot}
                        <span className="ml-2 text-xs text-slate-400">{item.kitchen_status}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
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
                    onClick={() => void payCash(order.id, order.subtotal)}
                    className="gap-1.5"
                  >
                    {cashLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    ) : null}
                    Cash / close
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
