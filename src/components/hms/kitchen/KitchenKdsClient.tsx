"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { FbKitchenTicket, FbStationRow } from "@/lib/hms/fb-types";
import { filterKitchenTicketsByStation } from "@/lib/hms/load-fb-pages";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";

const OVERDUE_MINUTES = 10;
const ACK_SNOOZE_MS = 3 * 60_000;
const CLOCK_MS = 15_000;

type KitchenItemAction = "preparing" | "ready" | "sold-out";

function ticketStartMs(ticket: FbKitchenTicket) {
  return new Date(ticket.sent_to_kitchen_at ?? ticket.created_at).getTime();
}

function ticketWaitMins(ticket: FbKitchenTicket, now: number) {
  return Math.floor((now - ticketStartMs(ticket)) / 60_000);
}

function ticketHasOpenItems(ticket: FbKitchenTicket) {
  return ticket.items.some(
    (item) => item.kitchen_status === "pending" || item.kitchen_status === "preparing",
  );
}

function isTicketOverdue(ticket: FbKitchenTicket, now: number) {
  return ticketWaitMins(ticket, now) >= OVERDUE_MINUTES && ticketHasOpenItems(ticket);
}

function ticketWaitMinsFromTimes(sentAt: string | null, createdAt: string, now: number) {
  return (now - new Date(sentAt ?? createdAt).getTime()) / 60_000;
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function lerpRgb(
  from: [number, number, number],
  to: [number, number, number],
  t: number,
): string {
  const r = Math.round(lerp(from[0], to[0], t));
  const g = Math.round(lerp(from[1], to[1], t));
  const b = Math.round(lerp(from[2], to[2], t));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Border + background deepen from green → amber → red as wait time grows. */
function ticketAgeStyle(sentAt: string | null, createdAt: string, now: number): CSSProperties {
  const mins = ticketWaitMinsFromTimes(sentAt, createdAt, now);

  if (mins < OVERDUE_MINUTES) {
    return {
      borderColor: "#6ee7b7",
      backgroundColor: "#ecfdf5",
    };
  }

  const overdueMins = mins - OVERDUE_MINUTES;
  const maxOverdue = 50;
  const t = Math.min(1, overdueMins / maxOverdue);

  const bgEarly: [number, number, number] = [255, 251, 235];
  const bgMid: [number, number, number] = [254, 226, 226];
  const bgLate: [number, number, number] = [254, 202, 202];

  const borderEarly: [number, number, number] = [251, 191, 36];
  const borderMid: [number, number, number] = [248, 113, 113];
  const borderLate: [number, number, number] = [220, 38, 38];

  if (t < 0.5) {
    const local = t * 2;
    return {
      borderColor: lerpRgb(borderEarly, borderMid, local),
      backgroundColor: lerpRgb(bgEarly, bgMid, local),
    };
  }

  const local = (t - 0.5) * 2;
  return {
    borderColor: lerpRgb(borderMid, borderLate, local),
    backgroundColor: lerpRgb(bgMid, bgLate, local),
  };
}

function formatWait(sentAt: string | null, createdAt: string, now: number) {
  const mins = Math.floor((now - new Date(sentAt ?? createdAt).getTime()) / 60_000);
  return `${mins}m`;
}

function playKitchenBuzz() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    window.setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 180);
  } catch {
    /* Audio not available */
  }
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
  const [busy, setBusy] = useState<{ itemId: string; action: KitchenItemAction } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [overdueAlertOpen, setOverdueAlertOpen] = useState(false);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const lastBuzzAt = useRef(0);

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

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => window.clearInterval(id);
  }, []);

  const filtered = useMemo(
    () => filterKitchenTicketsByStation(tickets, station),
    [tickets, station],
  );

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      if (a.rush !== b.rush) return a.rush ? -1 : 1;
      return ticketStartMs(a) - ticketStartMs(b);
    });
  }, [filtered]);

  const overdueTickets = useMemo(
    () => sorted.filter((ticket) => isTicketOverdue(ticket, now)),
    [sorted, now],
  );

  const hasOverdue = overdueTickets.length > 0;
  const isSnoozed = snoozedUntil > now;

  const acknowledgeOverdueAlert = useCallback(() => {
    setSnoozedUntil(Date.now() + ACK_SNOOZE_MS);
    setOverdueAlertOpen(false);
  }, []);

  useEffect(() => {
    if (!hasOverdue) {
      setSnoozedUntil(0);
      setOverdueAlertOpen(false);
      return;
    }
    if (isSnoozed) {
      setOverdueAlertOpen(false);
      return;
    }
    setOverdueAlertOpen(true);
    if (Date.now() - lastBuzzAt.current >= 2500) {
      playKitchenBuzz();
      lastBuzzAt.current = Date.now();
    }
  }, [hasOverdue, isSnoozed, overdueTickets]);

  useEffect(() => {
    if (!hasOverdue || !isSnoozed) return;
    const delay = snoozedUntil - Date.now();
    if (delay <= 0) return;
    const id = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(id);
  }, [hasOverdue, isSnoozed, snoozedUntil]);

  useEffect(() => {
    if (!overdueAlertOpen || !hasOverdue) return;
    const id = window.setInterval(() => {
      playKitchenBuzz();
      lastBuzzAt.current = Date.now();
    }, 3000);
    return () => window.clearInterval(id);
  }, [overdueAlertOpen, hasOverdue]);

  const updateItem = async (itemId: string, kitchenStatus: "preparing" | "ready") => {
    const action: KitchenItemAction = kitchenStatus;
    setBusy({ itemId, action });
    const res = await fetch(`/api/hotel/fb/order-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, kitchenStatus }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json();
      toastError("Update failed", data.error ?? "Try again.");
      return;
    }
    await load();
  };

  const markSoldOut = async (orderItemId: string, menuItemId: string | null, itemName: string) => {
    if (!menuItemId) return;
    setBusy({ itemId: orderItemId, action: "sold-out" });
    const res = await fetch(`/api/hotel/fb/menu-items/${menuItemId}/eighty-six`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    setBusy(null);
    if (!res.ok) {
      const data = await res.json();
      toastError("Could not mark sold out", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Marked sold out", `${itemName} is hidden from POS until back in stock.`);
    await load();
  };

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Live orders</h1>
        <p className="text-sm text-slate-500">
          Kitchen display — tickets sorted by time, rush first. Amber/red cards are waiting over{" "}
          {OVERDUE_MINUTES} minutes.
        </p>
      </div>

      <AlertDialog
        open={overdueAlertOpen}
        onOpenChange={(open) => {
          if (open) setOverdueAlertOpen(true);
          else acknowledgeOverdueAlert();
        }}
      >
        <AlertDialogContent className="border-red-300">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="h-5 w-5" aria-hidden />
              Orders waiting over {OVERDUE_MINUTES} minutes
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-slate-700">
                <p>These tickets still have items not marked ready:</p>
                <ul className="max-h-48 space-y-2 overflow-y-auto">
                  {overdueTickets.map((ticket) => (
                    <li
                      key={ticket.id}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-slate-900"
                    >
                      <span className="font-semibold">#{ticket.order_number}</span>
                      <span className="text-slate-600"> · {ticket.table_label}</span>
                      <span className="ml-2 font-bold text-red-700 tabular-nums">
                        {formatWait(ticket.sent_to_kitchen_at, ticket.created_at, now)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500">
                  Acknowledging snoozes this alert for 3 minutes. It will return if tickets are
                  still open.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={acknowledgeOverdueAlert}>Acknowledge</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
              style={ticketAgeStyle(ticket.sent_to_kitchen_at, ticket.created_at, now)}
              className={cn(
                "rounded-2xl border-2 p-4 shadow-sm transition-[background-color,border-color] duration-500",
                ticket.rush && "ring-2 ring-red-400 ring-offset-2",
              )}
            >
              <div className="flex items-start justify-between text-slate-900">
                <div>
                  <p className="text-lg font-bold">#{ticket.order_number}</p>
                  <p className="text-sm font-medium text-slate-600">{ticket.table_label}</p>
                </div>
                <span
                  className={cn(
                    "rounded-lg px-2 py-1 text-sm font-bold tabular-nums",
                    isTicketOverdue(ticket, now)
                      ? "bg-red-600 text-white"
                      : "bg-slate-100 text-slate-700",
                  )}
                >
                  {formatWait(ticket.sent_to_kitchen_at, ticket.created_at, now)}
                </span>
              </div>
              {ticket.rush ? (
                <p className="mt-1 text-xs font-bold uppercase text-red-700">Rush</p>
              ) : null}
              {isTicketOverdue(ticket, now) ? (
                <p className="mt-1 text-xs font-semibold text-red-700">Overdue — check this ticket</p>
              ) : null}
              <ul className="mt-3 space-y-2">
                {ticket.items.map((item) => {
                  const itemBusy = busy?.itemId === item.id;
                  const preparingLoading = itemBusy && busy.action === "preparing";
                  const readyLoading = itemBusy && busy.action === "ready";
                  const soldOutLoading = itemBusy && busy.action === "sold-out";

                  return (
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
                          disabled={itemBusy}
                          onClick={() => void updateItem(item.id, "preparing")}
                          className="gap-1.5"
                        >
                          {preparingLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : null}
                          Preparing
                        </Button>
                      ) : null}
                      {item.kitchen_status !== "ready" ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={itemBusy}
                          onClick={() => void updateItem(item.id, "ready")}
                          className="gap-1.5"
                        >
                          {readyLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : null}
                          Ready
                        </Button>
                      ) : null}
                      {item.menu_item_id ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={itemBusy}
                          title="Mark this dish sold out — it will be grayed out on POS"
                          onClick={() => void markSoldOut(item.id, item.menu_item_id, item.name)}
                          className="gap-1.5"
                        >
                          {soldOutLoading ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                          ) : null}
                          Sold out
                        </Button>
                      ) : null}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
