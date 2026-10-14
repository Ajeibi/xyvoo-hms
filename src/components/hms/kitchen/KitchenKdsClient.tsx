"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlarmClock, AlertTriangle, Check, Clock, Flame, Loader2 } from "lucide-react";
import type { FbKitchenTicket, FbStationRow } from "@/lib/hms/fb-types";
import { filterKitchenTicketsByStation } from "@/lib/hms/load-fb-pages";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { useClientNow } from "@/hooks/useClientNow";
import { HmsEmptyState, HmsPageHeader, HmsPill } from "@/components/hms/hms-ui";
import { HmsFilterChips } from "@/components/hms/hms-ui-client";
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
import { DEFAULT_KITCHEN_OVERDUE_MINUTES } from "@/lib/hms/fb-settings";
import {
  formatWaitMinutes,
  hasOpenKitchenItems,
  isKitchenWorkComplete,
  isOrderKitchenOverdue,
  resolveTimingNow,
  ticketAgeStyle,
  ticketWaitMinsFloat,
} from "@/lib/hms/fb-order-timing";

const ACK_SNOOZE_MS = 3 * 60_000;
const CLOCK_MS = 15_000;

type KitchenItemAction = "preparing" | "ready" | "sold-out";

const KDS_BUTTON =
  "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50";

const ITEM_STATUS_LABEL: Record<string, string> = {
  pending: "Waiting",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  voided: "Cancelled",
};

const ITEM_STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "slate",
  preparing: "amber",
  ready: "green",
  served: "blue",
  voided: "red",
};

function busyKey(itemId: string, action: KitchenItemAction) {
  return `${itemId}:${action}`;
}

function ticketStartMs(ticket: FbKitchenTicket) {
  return new Date(ticket.sent_to_kitchen_at ?? ticket.created_at).getTime();
}

function ticketWaitMins(ticket: FbKitchenTicket, now: number) {
  return Math.floor(ticketWaitMinsFloat(ticket.sent_to_kitchen_at, ticket.created_at, now));
}

function formatWait(sentAt: string | null, createdAt: string, now: number) {
  return formatWaitMinutes(sentAt, createdAt, now);
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
  kitchenOverdueMinutes: initialOverdueMinutes = DEFAULT_KITCHEN_OVERDUE_MINUTES,
  observerMode = false,
}: {
  slug: string;
  tenantId: string;
  initial: { tickets: FbKitchenTicket[]; stations: FbStationRow[] };
  kitchenOverdueMinutes?: number;
  observerMode?: boolean;
}) {
  const [station, setStation] = useState("all");
  const [stations, setStations] = useState<FbStationRow[]>(initial.stations);
  const [tickets, setTickets] = useState<FbKitchenTicket[]>(initial.tickets);
  const [overdueMinutes, setOverdueMinutes] = useState(initialOverdueMinutes);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [now, refreshNow] = useClientNow(CLOCK_MS);
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
      if (typeof data.kitchenOverdueMinutes === "number") {
        setOverdueMinutes(data.kitchenOverdueMinutes);
      }
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
      return ticketStartMs(a) - ticketStartMs(b);
    });
  }, [filtered]);

  const overdueTickets = useMemo(
    () =>
      sorted.filter((ticket) => {
        const timingNow = resolveTimingNow(
          now,
          ticket.sent_to_kitchen_at,
          ticket.created_at,
        );
        return isOrderKitchenOverdue(
          ticket.sent_to_kitchen_at,
          ticket.created_at,
          timingNow,
          hasOpenKitchenItems(ticket.items),
          ticket.overdue_minutes ?? overdueMinutes,
        );
      }),
    [sorted, now, overdueMinutes],
  );

  const hasOverdue = now !== null && overdueTickets.length > 0;
  const isSnoozed = now !== null && snoozedUntil > now;

  const acknowledgeOverdueAlert = useCallback(() => {
    setSnoozedUntil(Date.now() + ACK_SNOOZE_MS);
    setOverdueAlertOpen(false);
  }, []);

  useEffect(() => {
    if (observerMode) {
      setOverdueAlertOpen(false);
      setSnoozedUntil(0);
      return;
    }
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
  }, [hasOverdue, isSnoozed, overdueTickets, observerMode]);

  useEffect(() => {
    if (observerMode || !hasOverdue || !isSnoozed) return;
    const delay = snoozedUntil - Date.now();
    if (delay <= 0) return;
    const id = window.setTimeout(refreshNow, delay);
    return () => window.clearTimeout(id);
  }, [hasOverdue, isSnoozed, snoozedUntil, observerMode, refreshNow]);

  useEffect(() => {
    if (observerMode || !overdueAlertOpen || !hasOverdue) return;
    const id = window.setInterval(() => {
      playKitchenBuzz();
      lastBuzzAt.current = Date.now();
    }, 3000);
    return () => window.clearInterval(id);
  }, [overdueAlertOpen, hasOverdue, observerMode]);

  const withBusy = async (itemId: string, action: KitchenItemAction, run: () => Promise<void>) => {
    const key = busyKey(itemId, action);
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

  const updateItem = async (itemId: string, kitchenStatus: "preparing" | "ready") => {
    await withBusy(itemId, kitchenStatus, async () => {
      const res = await fetch(`/api/hotel/fb/order-items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, kitchenStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        toastError("Update failed", data.error ?? "Try again.");
        return;
      }
      await load();
    });
  };

  const markSoldOut = async (orderItemId: string, menuItemId: string | null, itemName: string) => {
    if (!menuItemId) return;
    await withBusy(orderItemId, "sold-out", async () => {
      const res = await fetch(`/api/hotel/fb/menu-items/${menuItemId}/eighty-six`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const data = await res.json();
        toastError("Could not mark sold out", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Marked sold out", `${itemName} is hidden from POS until back in stock.`);
      await load();
    });
  };

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Kitchen"
        meaning="food"
        title="Live orders"
        description={
          <>
            Oldest tickets first, with rush orders at the top. Cards turn from green to amber to red as
            they near the cook-time target ({overdueMinutes} minutes unless a category has its own, set in
            Kitchen settings).
          </>
        }
        actions={
          hasOverdue ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-800 ring-1 ring-rose-200">
              <AlarmClock className="h-4 w-4" aria-hidden />
              {overdueTickets.length} overdue
            </span>
          ) : null
        }
      />

      {!observerMode ? (
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
              Orders waiting over {overdueMinutes} minutes
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
                        {formatWait(
                          ticket.sent_to_kitchen_at,
                          ticket.created_at,
                          resolveTimingNow(now, ticket.sent_to_kitchen_at, ticket.created_at),
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-sm text-slate-600">
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
      ) : null}

      {stations.length > 0 ? (
        <HmsFilterChips
          label="Station"
          meaning="food"
          value={station}
          onChange={setStation}
          options={[
            { value: "all", label: "All", count: tickets.length },
            ...stations.map((s) => ({
              value: s.code,
              label: s.name,
              count: filterKitchenTicketsByStation(tickets, s.code).length,
            })),
          ]}
        />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {sorted.length === 0 ? (
          <div className="col-span-full">
            <HmsEmptyState
              art="basket"
              meaning="food"
              title="No open tickets"
              description="New orders appear here as soon as they're sent from the POS."
            />
          </div>
        ) : (
          sorted.map((ticket) => {
            const kitchenDone = isKitchenWorkComplete(ticket.items);
            const timingNow = resolveTimingNow(
              now,
              ticket.sent_to_kitchen_at,
              ticket.created_at,
            );
            const waitLabel = formatWait(ticket.sent_to_kitchen_at, ticket.created_at, timingNow);
            const ticketThreshold = ticket.overdue_minutes ?? overdueMinutes;
            const ticketOverdue = isOrderKitchenOverdue(
              ticket.sent_to_kitchen_at,
              ticket.created_at,
              timingNow,
              hasOpenKitchenItems(ticket.items),
              ticketThreshold,
            );

            return (
            <div
              key={ticket.id}
              style={ticketAgeStyle(ticket.sent_to_kitchen_at, ticket.created_at, timingNow, {
                kitchenComplete: kitchenDone,
                overdueMinutes: ticketThreshold,
              })}
              className={cn(
                "rounded-2xl border-2 p-4 shadow-sm transition-[background-color,border-color] duration-500",
                ticket.rush && "ring-2 ring-rose-500 ring-offset-2",
              )}
            >
              <div className="flex items-start justify-between gap-2 text-slate-900">
                <div>
                  <p className="font-heading text-xl font-bold">#{ticket.order_number}</p>
                  <p className="text-sm font-medium text-slate-700">{ticket.table_label}</p>
                </div>
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-bold tabular-nums",
                    kitchenDone
                      ? "bg-emerald-700 text-white"
                      : ticketOverdue
                        ? "bg-rose-700 text-white"
                        : "bg-white/90 text-slate-800 ring-1 ring-slate-200",
                  )}
                >
                  {kitchenDone ? <Check className="h-4 w-4" aria-hidden /> : <Clock className="h-4 w-4" aria-hidden />}
                  {kitchenDone ? `Ready · ${waitLabel}` : waitLabel}
                </span>
              </div>
              {ticket.rush || ticketOverdue ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {ticket.rush ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-800 ring-1 ring-rose-200">
                      <Flame className="h-3.5 w-3.5" aria-hidden />
                      Rush
                    </span>
                  ) : null}
                  {ticketOverdue ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-xs font-bold text-rose-800 ring-1 ring-rose-200">
                      <AlarmClock className="h-3.5 w-3.5" aria-hidden />
                      Overdue, check this ticket
                    </span>
                  ) : null}
                </div>
              ) : null}
              <ul className="mt-3 space-y-2">
                {ticket.items.map((item) => {
                  const preparingLoading = busyKeys.has(busyKey(item.id, "preparing"));
                  const readyLoading = busyKeys.has(busyKey(item.id, "ready"));
                  const soldOutLoading = busyKeys.has(busyKey(item.id, "sold-out"));
                  const itemBusy = preparingLoading || readyLoading || soldOutLoading;

                  return (
                  <li
                    key={item.id}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-slate-900"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-base font-semibold">
                        {item.quantity}× {item.name}
                      </p>
                      <HmsPill tone={ITEM_STATUS_TONE[item.kitchen_status] ?? "slate"}>
                        {ITEM_STATUS_LABEL[item.kitchen_status] ?? item.kitchen_status}
                      </HmsPill>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.kitchen_status === "pending" ? (
                        <button
                          type="button"
                          disabled={itemBusy}
                          onClick={() => void updateItem(item.id, "preparing")}
                          className={cn(KDS_BUTTON, "border border-orange-300 bg-orange-50 text-orange-900 hover:bg-orange-100")}
                        >
                          {preparingLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : null}
                          Preparing
                        </button>
                      ) : null}
                      {item.kitchen_status !== "ready" ? (
                        <button
                          type="button"
                          disabled={itemBusy}
                          onClick={() => void updateItem(item.id, "ready")}
                          className={cn(KDS_BUTTON, "bg-emerald-700 text-white hover:bg-emerald-800")}
                        >
                          {readyLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : (
                            <Check className="h-4 w-4" aria-hidden />
                          )}
                          Ready
                        </button>
                      ) : null}
                      {item.menu_item_id &&
                      item.kitchen_status !== "ready" &&
                      item.kitchen_status !== "served" &&
                      item.kitchen_status !== "voided" ? (
                        <button
                          type="button"
                          disabled={itemBusy}
                          title="Mark this dish sold out. It will be greyed out on the POS."
                          onClick={() => void markSoldOut(item.id, item.menu_item_id, item.name)}
                          className={cn(KDS_BUTTON, "text-red-700 hover:bg-red-50")}
                        >
                          {soldOutLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                          ) : null}
                          Sold out
                        </button>
                      ) : null}
                    </div>
                  </li>
                  );
                })}
              </ul>
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
