"use client";

import { useCallback, useState } from "react";
import type { FbOrderWithItems } from "@/lib/hms/fb-types";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";

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
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (res.ok) setOrders(data.orders ?? []);
  }, [slug]);

  useFbRealtime(tenantId, () => void load());

  const chargeToRoom = async (orderId: string, amount: number) => {
    if (!reservationId.trim()) {
      toastError("Room charge", "Enter a reservation ID for charge-to-room.");
      return;
    }
    setBusyId(orderId);
    const res = await fetch(`/api/hotel/fb/orders/${orderId}/folio-charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, reservationId: reservationId.trim() }),
    });
    const data = await res.json();
    setBusyId(null);
    if (!res.ok) {
      toastError("Folio charge failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Posted to folio");
    await load();
  };

  const payCash = async (orderId: string, amount: number) => {
    if (!reservationId.trim()) {
      setBusyId(orderId);
      const closeRes = await fetch(`/api/hotel/fb/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "close" }),
      });
      setBusyId(null);
      if (!closeRes.ok) {
        const data = await closeRes.json();
        toastError("Close failed", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Order closed (walk-in cash)");
      await load();
      return;
    }
    setBusyId(orderId);
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
    setBusyId(null);
    if (!res.ok) {
      toastError("Payment failed", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Cash payment recorded");
    await load();
  };

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

      <div className="space-y-3">
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">No open orders.</p>
        ) : (
          orders.map((order) => (
            <div key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    #{order.order_number}
                    {order.rush ? (
                      <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-700">RUSH</span>
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
                  disabled={busyId === order.id}
                  onClick={() => void chargeToRoom(order.id, order.subtotal)}
                >
                  Charge to room
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === order.id}
                  onClick={() => void payCash(order.id, order.subtotal)}
                >
                  Cash / close
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
