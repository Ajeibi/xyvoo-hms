"use client";

import { useCallback, useMemo, useState } from "react";
import type { FbKitchenTicket, FbStationRow } from "@/lib/hms/fb-types";
import { filterKitchenTicketsByStation } from "@/lib/hms/load-fb-pages";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toastError } from "@/lib/app-toast";

function ticketAgeClass(sentAt: string | null, createdAt: string) {
  const t = new Date(sentAt ?? createdAt).getTime();
  const mins = (Date.now() - t) / 60000;
  if (mins >= 20) return "border-red-400 bg-red-50";
  if (mins >= 10) return "border-amber-400 bg-amber-50";
  return "border-emerald-300 bg-emerald-50";
}

function formatWait(sentAt: string | null, createdAt: string) {
  const mins = Math.floor((Date.now() - new Date(sentAt ?? createdAt).getTime()) / 60000);
  return `${mins}m`;
}

export function KitchenKdsClient({
  slug,
  tenantId,
  initial,
}: {
  slug: string;
  tenantId: string;
  initial: { tickets: FbKitchenTicket[]; stations: FbStationRow[] };
}) {
  const [station, setStation] = useState("all");
  const [stations, setStations] = useState<FbStationRow[]>(initial.stations);
  const [tickets, setTickets] = useState<FbKitchenTicket[]>(initial.tickets);
  const [busyItem, setBusyItem] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(
      `/api/hotel/fb/kitchen/board?slug=${encodeURIComponent(slug)}&station=all`,
    );
    const data = await res.json();
    if (res.ok) {
      setTickets(data.tickets ?? []);
      setStations(data.stations ?? []);
    }
  }, [slug]);

  useFbRealtime(tenantId, () => void load());

  const filtered = useMemo(
    () => filterKitchenTicketsByStation(tickets, station),
    [tickets, station],
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.rush !== b.rush) return a.rush ? -1 : 1;
      return (
        new Date(a.sent_to_kitchen_at ?? a.created_at).getTime() -
        new Date(b.sent_to_kitchen_at ?? b.created_at).getTime()
      );
    });
  }, [filtered]);

  const updateItem = async (itemId: string, kitchenStatus: "preparing" | "ready") => {
    setBusyItem(itemId);
    const res = await fetch(`/api/hotel/fb/order-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, kitchenStatus }),
    });
    setBusyItem(null);
    if (!res.ok) {
      const data = await res.json();
      toastError("Update failed", data.error ?? "Try again.");
      return;
    }
    await load();
  };

  const eightySix = async (menuItemId: string | null) => {
    if (!menuItemId) return;
    const res = await fetch(`/api/hotel/fb/menu-items/${menuItemId}/eighty-six`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) {
      const data = await res.json();
      toastError("86 failed", data.error ?? "Try again.");
      return;
    }
    await load();
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Live orders</h1>
        <p className="text-sm text-slate-500">Kitchen display — tickets sorted by time, rush first.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setStation("all")}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
            station === "all"
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200",
          )}
        >
          All
        </button>
        {stations.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStation(s.code)}
            className={cn(
              "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
              station === s.code
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            No open tickets.
          </p>
        ) : (
          sorted.map((ticket) => (
            <div
              key={ticket.id}
              className={cn(
                "rounded-2xl border-2 bg-white p-4 shadow-sm",
                ticketAgeClass(ticket.sent_to_kitchen_at, ticket.created_at),
                ticket.rush && "ring-2 ring-red-400 ring-offset-2",
              )}
            >
              <div className="flex items-start justify-between text-slate-900">
                <div>
                  <p className="text-lg font-bold">#{ticket.order_number}</p>
                  <p className="text-sm font-medium text-slate-600">{ticket.table_label}</p>
                </div>
                <span className="rounded-lg bg-slate-100 px-2 py-1 text-sm font-bold tabular-nums text-slate-700">
                  {formatWait(ticket.sent_to_kitchen_at, ticket.created_at)}
                </span>
              </div>
              {ticket.rush ? (
                <p className="mt-1 text-xs font-bold uppercase text-red-700">Rush</p>
              ) : null}
              <ul className="mt-3 space-y-2">
                {ticket.items.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-slate-900"
                  >
                    <p className="text-sm font-semibold">
                      {item.quantity}× {item.name}
                    </p>
                    <p className="text-xs capitalize text-slate-500">{item.kitchen_status}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {item.kitchen_status === "pending" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busyItem === item.id}
                          onClick={() => void updateItem(item.id, "preparing")}
                        >
                          Preparing
                        </Button>
                      ) : null}
                      {item.kitchen_status !== "ready" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busyItem === item.id}
                          onClick={() => void updateItem(item.id, "ready")}
                        >
                          Ready
                        </Button>
                      ) : null}
                      {item.menu_item_id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void eightySix(item.menu_item_id)}
                        >
                          86
                        </Button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
