"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlarmClock, ArrowRightLeft, Banknote, BedDouble, Check, Combine, Flame, Loader2, Printer, Search, Send, Split } from "lucide-react";
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
import { courseLabel, summariseCourses } from "@/lib/hms/fb-course-rules";
import { evenShares, leftToPay, resolvePartPayment } from "@/lib/hms/fb-payment-rules";
import { billsBySeat, mergeBlockReason, planSplit, splittableItems } from "@/lib/hms/fb-split-rules";
import { cancelNeeds, compNeeds, FB_COMP_REASONS, FB_VOID_REASONS, FB_WAIVE_REASONS, voidNeeds } from "@/lib/hms/fb-void-rules";
import { computeBillTotals } from "@/lib/hms/fb-bill-rules";
import { openPrint, receiptPrintUrl, reservePrintWindow, useDevicePrintSetting } from "@/lib/hms/fb-print-links";
import { ManagerPinField, ReasonPicker } from "@/components/hms/fb/FbReasonFields";
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

type OrderAction = "charge" | "pos" | "cancel" | "send" | "serve" | "fire" | "split" | "merge" | "line" | "move" | "waive";

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
  if (method === "split") return "Several payments";
  return method;
}

function notSentFor(order: FbOrderWithItems) {
  return order.status === "open";
}

/** "Fired 12m ago" style age, or "" before the clock is known. */
function sinceLabel(iso: string | null, now: number | null) {
  if (!iso || now === null) return "";
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  return mins < 1 ? "just now" : `${mins}m ago`;
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
  const [splitTarget, setSplitTarget] = useState<FbOrderWithItems | null>(null);
  const [splitCount, setSplitCount] = useState(2);
  const [billOf, setBillOf] = useState<Record<string, number>>({});
  const [mergeSource, setMergeSource] = useState<FbOrderWithItems | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"cash" | "pos">("pos");
  const [cashReceived, setCashReceived] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
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

  const [payMode, setPayMode] = useState<"all" | "even" | "other">("all");
  const [printReceipts, setPrintReceipts] = useDevicePrintSetting("receipt-on-pay");
  const [evenPeople, setEvenPeople] = useState(2);
  const [otherAmount, setOtherAmount] = useState("");

  const openPaySheet = (order: FbOrderWithItems) => {
    setPayTarget(order);
    setPayMethod("pos");
    setCashReceived("");
    setPayError(null);
    setPayMode("all");
    setEvenPeople(2);
    setOtherAmount("");
  };

  const closePaySheet = () => {
    setPayTarget(null);
    setCashReceived("");
    setPayError(null);
  };

  const payLeft = payTarget ? leftToPay(payTarget) : 0;
  // Shares of this even split already paid (payments labelled "Share k of N").
  const sharesPaid = payTarget
    ? (payTarget.payments ?? []).filter((p) => p.share_label?.endsWith(` of ${evenPeople}`)).length
    : 0;
  const sharesLeft = Math.max(1, evenPeople - sharesPaid);
  const payAmount =
    payMode === "all"
      ? payLeft
      : payMode === "even"
        ? evenShares(payLeft, sharesLeft)[0]
        : Number(otherAmount);
  const shareLabel =
    payMode === "even" ? `Share ${Math.min(sharesPaid + 1, evenPeople)} of ${evenPeople}` : undefined;

  // Blank cash field = exact money. Checked again on the server.
  const cashTendered = cashReceived.trim() === "" ? null : Number(cashReceived);
  const payCheck = payTarget
    ? resolvePartPayment({
        left: payLeft,
        amount: payAmount,
        method: payMethod,
        tendered: payMethod === "cash" ? cashTendered : null,
      })
    : null;

  const confirmSettlePos = async () => {
    if (!payTarget || !payCheck) return;
    if (!payCheck.ok) {
      setPayError(payCheck.error);
      return;
    }
    const order = payTarget;
    const amount = payAmount;
    const methodLabel = payMethod === "cash" ? "Cash" : "PoS terminal";
    const printWindow = printReceipts && amount >= payLeft ? reservePrintWindow() : null;
    await withBusy(order.id, "pos", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${order.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          method: payMethod,
          amount,
          amountTendered: payMethod === "cash" ? (cashTendered ?? undefined) : undefined,
          shareLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        printWindow?.cancel();
        setPayError(data.error ?? "Try again.");
        toastError("Payment failed", data.error ?? "Try again.");
        await load();
        return;
      }
      const change = Number(data.changeGiven) || 0;
      const changeNote = change > 0 ? ` · change ${formatPricingAmount(change, currency)}` : "";
      if (data.settled) {
        printWindow?.go(receiptPrintUrl(slug, order.id));
        toastSuccess("Bill paid", `${methodLabel} ${formatPricingAmount(amount, currency)}${changeNote}`);
        closePaySheet();
      } else {
        printWindow?.cancel();
        // Part paid: keep the dialog open for the next payment.
        toastSuccess(
          `${methodLabel} ${formatPricingAmount(amount, currency)} taken`,
          `${formatPricingAmount(Number(data.remaining) || 0, currency)} left to pay${changeNote}`,
        );
        if (data.order) setPayTarget(data.order);
        setCashReceived("");
        setOtherAmount("");
        setPayError(null);
      }
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

  const fireCourse = async (orderId: string, course: number | "all", label: string) => {
    await withBusy(orderId, "fire", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "fire", course }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Could not fire", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${label} fired`, "The kitchen can start now.");
      await load();
    });
  };

  const openSplit = (order: FbOrderWithItems) => {
    setSplitTarget(order);
    setSplitCount(2);
    setBillOf(Object.fromEntries(splittableItems(order.items).map((i) => [i.id, 1])));
  };

  const splitPlan = splitTarget ? planSplit(splitTarget.items, billOf) : null;
  const splitBusy = splitTarget !== null && busyKeys.has(busyKey(splitTarget.id, "split"));

  const confirmSplit = async () => {
    if (!splitTarget || !splitPlan?.ok) return;
    const order = splitTarget;
    await withBusy(order.id, "split", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "split", billOf }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Could not split", data.error ?? "Try again.");
        await load();
        return;
      }
      toastSuccess(
        `Split into ${data.orders?.length ?? splitPlan.bills.length} bills`,
        (data.orders ?? []).map((o: FbOrderWithItems) => `#${o.order_number}`).join(", "),
      );
      setSplitTarget(null);
      await load();
    });
  };

  const mergeCandidates = mergeSource
    ? orders
        .filter((o) => o.id !== mergeSource.id && !mergeBlockReason(o, mergeSource))
        .sort(
          (a, b) =>
            Number(b.table_id === mergeSource.table_id && Boolean(mergeSource.table_id)) -
            Number(a.table_id === mergeSource.table_id && Boolean(mergeSource.table_id)),
        )
    : [];
  const mergeBusy = mergeSource !== null && busyKeys.has(busyKey(mergeSource.id, "merge"));

  const confirmMerge = async () => {
    if (!mergeSource || !mergeTargetId) return;
    const source = mergeSource;
    await withBusy(source.id, "merge", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${source.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "merge", intoOrderId: mergeTargetId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Could not combine", data.error ?? "Try again.");
        await load();
        return;
      }
      toastSuccess("Bills combined", data.order ? `#${data.order.order_number} · ${formatPricingAmount(data.order.subtotal, currency)}` : undefined);
      setMergeSource(null);
      setMergeTargetId(null);
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
    if (cancelNeeds(target.items).needsReason && !cancelReason.trim()) {
      toastError("Give a reason", "The kitchen has started on this order.");
      return;
    }
    await withBusy(target.id, "cancel", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          action: "void",
          voidReason: cancelReason.trim() || undefined,
          managerPin: managerPin.trim() || undefined,
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
      setManagerPin("");
      await load();
    });
  };

  // Remove (void) or give free (comp) one line, and move a party to another table.
  const [lineAction, setLineAction] = useState<{
    order: FbOrderWithItems;
    item: FbOrderWithItems["items"][number];
    kind: "void" | "comp";
  } | null>(null);
  const [lineReason, setLineReason] = useState("");
  const [managerPin, setManagerPin] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const [moveTarget, setMoveTarget] = useState<FbOrderWithItems | null>(null);
  const [moveTables, setMoveTables] = useState<{ id: string; table_code: string; covers: number; status: string }[]>([]);
  const [moveTableId, setMoveTableId] = useState<string | null>(null);

  const lineNeeds = lineAction
    ? lineAction.kind === "void"
      ? voidNeeds(lineAction.item)
      : compNeeds(lineAction.item)
    : null;
  const lineBusy = lineAction !== null && busyKeys.has(busyKey(lineAction.order.id, "line"));
  const cancelRules = cancelTarget ? cancelNeeds(cancelTarget.items) : null;

  const openLineAction = (order: FbOrderWithItems, item: FbOrderWithItems["items"][number], kind: "void" | "comp") => {
    setLineAction({ order, item, kind });
    setLineReason("");
    setManagerPin("");
    setLineError(null);
  };

  const confirmLineAction = async () => {
    if (!lineAction || !lineNeeds) return;
    const { order, item, kind } = lineAction;
    if (lineNeeds.needsReason && !lineReason.trim()) {
      setLineError("Give a reason.");
      return;
    }
    await withBusy(order.id, "line", async () => {
      const res = await fetch(`/api/hotel/fb/order-items/${item.id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason: lineReason.trim() || null, managerPin: managerPin.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLineError(data.error ?? "Try again.");
        return;
      }
      toastSuccess(kind === "void" ? "Item removed" : "Item given free", item.name_snapshot);
      setLineAction(null);
      await load();
    });
  };

  const openMove = async (order: FbOrderWithItems) => {
    setMoveTarget(order);
    setMoveTableId(null);
    const res = await fetch(`/api/hotel/fb/config?slug=${encodeURIComponent(slug)}&seed=0`);
    const cfg = await res.json();
    if (res.ok) {
      const restaurantIds = (cfg.outlets ?? [])
        .filter((o: { outlet_type: string }) => o.outlet_type === "restaurant")
        .map((o: { id: string }) => o.id);
      setMoveTables((cfg.tables ?? []).filter((t: { outlet_id: string }) => restaurantIds.includes(t.outlet_id)));
    }
  };

  const moveBusy = moveTarget !== null && busyKeys.has(busyKey(moveTarget.id, "move"));

  const confirmMove = async () => {
    if (!moveTarget || !moveTableId) return;
    const order = moveTarget;
    await withBusy(order.id, "move", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "move_table", tableId: moveTableId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Could not move", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Moved table", data.order?.table_code ? `Now at ${data.order.table_code}` : undefined);
      setMoveTarget(null);
      await load();
    });
  };

  // Take the service charge off one bill (reason and manager).
  const [waiveTarget, setWaiveTarget] = useState<FbOrderWithItems | null>(null);
  const [waiveReason, setWaiveReason] = useState("");
  const [waiveError, setWaiveError] = useState<string | null>(null);
  const waiveBusy = waiveTarget !== null && busyKeys.has(busyKey(waiveTarget.id, "waive"));

  const confirmWaive = async () => {
    if (!waiveTarget) return;
    if (!waiveReason.trim()) {
      setWaiveError("Give a reason.");
      return;
    }
    const order = waiveTarget;
    await withBusy(order.id, "waive", async () => {
      const res = await fetch(`/api/hotel/fb/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, action: "waive_service", reason: waiveReason.trim(), managerPin: managerPin.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWaiveError(data.error ?? "Try again.");
        return;
      }
      toastSuccess("Service charge taken off", data.order ? `New total ${formatPricingAmount(data.order.subtotal, currency)}` : undefined);
      setWaiveTarget(null);
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
                {cancelRules?.needsManager ? (
                  <p className="font-medium text-amber-900">The kitchen has started on this order, so it will be counted as waste.</p>
                ) : null}
                <ReasonPicker
                  idPrefix="fb-orders-cancel"
                  reasons={FB_VOID_REASONS}
                  value={cancelReason}
                  required={Boolean(cancelRules?.needsReason)}
                  disabled={cancelBusy}
                  onChange={setCancelReason}
                />
                {cancelRules?.needsManager ? (
                  <ManagerPinField idPrefix="fb-orders-cancel" value={managerPin} disabled={cancelBusy} onChange={setManagerPin} />
                ) : null}
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
            <AlertDialogTitle>Take payment</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-left text-sm text-slate-600">
                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <p className="text-sm font-medium text-emerald-900">
                    {payTarget && payTarget.paid_amount > 0 ? "Left to pay" : "Amount due"}
                  </p>
                  <p className="text-2xl font-bold tabular-nums text-slate-900">
                    {formatPricingAmount(payLeft, currency)}
                  </p>
                  <p className="text-slate-700">
                    #{payTarget?.order_number}
                    {payTarget && payTarget.paid_amount > 0
                      ? ` · bill ${formatPricingAmount(payTarget.subtotal, currency)}, paid ${formatPricingAmount(payTarget.paid_amount, currency)}`
                      : ""}
                  </p>
                </div>
                {payTarget?.payments?.length ? (
                  <ul className="space-y-1 text-sm text-slate-700">
                    {payTarget.payments.map((p) => (
                      <li key={p.id} className="flex justify-between gap-2">
                        <span>
                          {formatSettlementMethod(p.method)}
                          {p.share_label ? ` · ${p.share_label}` : ""}
                        </span>
                        <span className="tabular-nums">{formatPricingAmount(p.amount, currency)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <div>
                  <p id="fb-orders-pay-how-much" className="mb-2 text-sm font-medium text-slate-800">How much</p>
                  <div role="group" aria-labelledby="fb-orders-pay-how-much" className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ["all", "All of it"],
                        ["even", "Split evenly"],
                        ["other", "Other amount"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={payMode === mode}
                        disabled={paySheetBusy}
                        onClick={() => {
                          setPayMode(mode);
                          setPayError(null);
                        }}
                        className={cn(
                          "min-h-11 rounded-xl border px-2 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                          payMode === mode
                            ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                            : "border-slate-200 text-slate-700 hover:bg-slate-50",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {payMode === "even" ? (
                  <div>
                    <p id="fb-orders-pay-people" className="mb-2 text-sm font-medium text-slate-800">Number of people</p>
                    <div role="group" aria-labelledby="fb-orders-pay-people" className="flex flex-wrap gap-2">
                      {[2, 3, 4, 5, 6, 8].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={evenPeople === n}
                          disabled={paySheetBusy}
                          onClick={() => setEvenPeople(n)}
                          className={cn(
                            "min-h-11 min-w-11 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                            evenPeople === n
                              ? "border-emerald-600 bg-emerald-50 text-emerald-900"
                              : "border-slate-200 text-slate-700 hover:bg-slate-50",
                          )}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 font-medium text-slate-800">
                      {shareLabel}: {formatPricingAmount(payAmount, currency)}
                      {sharesPaid > 0 ? (
                        <span className="font-normal text-slate-600"> · {sharesPaid} of {evenPeople} paid</span>
                      ) : null}
                    </p>
                  </div>
                ) : null}
                {payMode === "other" ? (
                  <HmsField id="fb-orders-pay-amount" label="Amount to pay now" hint={`Up to ${formatPricingAmount(payLeft, currency)}.`}>
                    <input
                      id="fb-orders-pay-amount"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={otherAmount}
                      disabled={paySheetBusy}
                      onChange={(e) => {
                        setOtherAmount(e.target.value);
                        setPayError(null);
                      }}
                      aria-describedby="fb-orders-pay-amount-hint"
                      className={hmsInput}
                    />
                  </HmsField>
                ) : null}
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
                {payMethod === "cash" ? (
                  <HmsField
                    id="fb-orders-cash-received"
                    label="Cash received"
                    optional
                    hint="Leave blank if the guest paid the exact amount."
                  >
                    <input
                      id="fb-orders-cash-received"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="0.01"
                      value={cashReceived}
                      disabled={paySheetBusy}
                      onChange={(e) => {
                        setCashReceived(e.target.value);
                        setPayError(null);
                      }}
                      aria-describedby="fb-orders-cash-received-hint fb-orders-cash-change"
                      className={hmsInput}
                    />
                  </HmsField>
                ) : null}
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={printReceipts}
                    disabled={paySheetBusy}
                    onChange={(e) => setPrintReceipts(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  Print a receipt when the bill is paid
                  <span className="sr-only"> (remembered on this device)</span>
                </label>
                <p id="fb-orders-cash-change" aria-live="polite" className="font-medium text-slate-800">
                  {payMethod === "cash" && payCheck?.ok && payCheck.changeGiven > 0
                    ? `Change to give: ${formatPricingAmount(payCheck.changeGiven, currency)}`
                    : ""}
                </p>
                <HmsAlert
                  message={
                    payError ??
                    (payCheck && !payCheck.ok && !(payMode === "other" && otherAmount.trim() === "")
                      ? payCheck.error
                      : "")
                  }
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={paySheetBusy}>Close</AlertDialogCancel>
            <Button
              type="button"
              disabled={paySheetBusy || !payCheck?.ok}
              className="gap-1.5"
              onClick={() => void confirmSettlePos()}
            >
              {paySheetBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Take {payCheck?.ok ? formatPricingAmount(payAmount, currency) : "payment"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={lineAction !== null}
        onOpenChange={(open) => {
          if (!open && !lineBusy) setLineAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lineAction?.kind === "comp" ? "Give free" : "Remove from the bill"}: {lineAction?.item.name_snapshot}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-slate-600">
                <p>
                  {lineAction?.kind === "comp"
                    ? "The kitchen still makes it, but it comes off the bill. It shows in the comps report."
                    : lineNeeds?.needsManager
                      ? "The kitchen has already started on this, so it will be counted as waste."
                      : "It hasn't gone to the kitchen yet, so it just comes off the bill."}
                </p>
                <ReasonPicker
                  idPrefix="fb-line"
                  reasons={lineAction?.kind === "comp" ? FB_COMP_REASONS : FB_VOID_REASONS}
                  value={lineReason}
                  required={Boolean(lineNeeds?.needsReason)}
                  disabled={lineBusy}
                  onChange={(v) => {
                    setLineReason(v);
                    setLineError(null);
                  }}
                />
                {lineNeeds?.needsManager ? (
                  <ManagerPinField value={managerPin} disabled={lineBusy} onChange={setManagerPin} idPrefix="fb-line" />
                ) : null}
                <HmsAlert message={lineError ?? ""} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lineBusy}>Back</AlertDialogCancel>
            <Button
              type="button"
              variant={lineAction?.kind === "void" ? "destructive" : "default"}
              disabled={lineBusy}
              className="gap-1.5"
              onClick={() => void confirmLineAction()}
            >
              {lineBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {lineAction?.kind === "comp" ? "Give free" : "Remove"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={moveTarget !== null}
        onOpenChange={(open) => {
          if (!open && !moveBusy) setMoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move #{moveTarget?.order_number} to another table</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-slate-600">
                <p>
                  {moveTarget?.table_code ? `Now at ${moveTarget.table_code}. ` : ""}
                  Every bill for this table moves together.
                </p>
                {moveTables.length === 0 ? (
                  <p>No tables set up yet.</p>
                ) : (
                  <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                    {moveTables.map((t) => {
                      const current = t.id === moveTarget?.table_id;
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            aria-pressed={moveTableId === t.id}
                            disabled={current || moveBusy}
                            onClick={() => setMoveTableId(t.id)}
                            className={cn(
                              "flex min-h-14 w-full flex-col items-center justify-center rounded-xl border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50",
                              moveTableId === t.id ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-800 hover:bg-slate-50",
                            )}
                          >
                            <span className="font-semibold">{t.table_code}</span>
                            <span className="text-xs text-slate-600">
                              {current ? "Here now" : t.status === "available" ? `${t.covers} seats` : t.status === "seated" ? "In use" : "Needs clearing"}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={moveBusy}>Back</AlertDialogCancel>
            <Button type="button" disabled={!moveTableId || moveBusy} className="gap-1.5" onClick={() => void confirmMove()}>
              {moveBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Move table
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={waiveTarget !== null}
        onOpenChange={(open) => {
          if (!open && !waiveBusy) setWaiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Take the service charge off #{waiveTarget?.order_number}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-slate-600">
                <p>
                  {waiveTarget
                    ? `The bill drops by ${formatPricingAmount(waiveTarget.subtotal - computeBillTotals(waiveTarget.items_total, { ...waiveTarget, service_charge_percent: 0 }).total, currency)}.`
                    : ""}
                </p>
                <ReasonPicker
                  idPrefix="fb-waive"
                  reasons={FB_WAIVE_REASONS}
                  value={waiveReason}
                  required
                  disabled={waiveBusy}
                  onChange={(v) => {
                    setWaiveReason(v);
                    setWaiveError(null);
                  }}
                />
                <ManagerPinField idPrefix="fb-waive" value={managerPin} disabled={waiveBusy} onChange={setManagerPin} />
                <HmsAlert message={waiveError ?? ""} />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={waiveBusy}>Back</AlertDialogCancel>
            <Button type="button" disabled={waiveBusy} className="gap-1.5" onClick={() => void confirmWaive()}>
              {waiveBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Take it off
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet
        open={splitTarget !== null}
        onOpenChange={(open) => {
          if (!open && !splitBusy) setSplitTarget(null);
        }}
      >
        <SheetContent className="flex flex-col gap-0 p-0">
          <SheetHeader className="border-b border-slate-100">
            <SheetTitle>Split bill{splitTarget ? ` — #${splitTarget.order_number}` : ""}</SheetTitle>
            <SheetDescription>Choose which bill each item goes on. Each bill is then paid on its own.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <p id="fb-split-count" className="mb-2 text-sm font-medium text-slate-800">Number of bills</p>
              <div role="group" aria-labelledby="fb-split-count" className="flex flex-wrap gap-2">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={splitCount === n}
                    disabled={splitBusy}
                    onClick={() => {
                      setSplitCount(n);
                      setBillOf((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, Math.min(v, n)])));
                    }}
                    className={cn(
                      "min-h-11 min-w-11 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      splitCount === n ? "border-orange-600 bg-orange-50 text-orange-900" : "border-slate-200 text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            {splitTarget && splittableItems(splitTarget.items).some((i) => i.seat) ? (
              <button
                type="button"
                disabled={splitBusy}
                onClick={() => {
                  const plan = billsBySeat(splittableItems(splitTarget.items));
                  setSplitCount(Math.max(2, plan.bills));
                  setBillOf(plan.billOf);
                }}
                className={hmsButton.small}
              >
                One bill per seat
              </button>
            ) : null}
            <ul className="space-y-2">
              {splitTarget
                ? splittableItems(splitTarget.items).map((item) => (
                    <li key={item.id} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-2 text-sm">
                        <span className="font-medium text-slate-900">
                          {item.quantity}× {item.name_snapshot}
                          {item.seat ? <span className="font-normal text-slate-600"> · seat {item.seat}</span> : null}
                          {item.modifiers?.length ? (
                            <span className="font-normal text-slate-600"> ({item.modifiers.map((m) => m.option_name).join(", ")})</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-700">
                          {formatPricingAmount(item.price_snapshot * item.quantity, currency)}
                        </span>
                      </div>
                      <div role="group" aria-label={`Bill for ${item.name_snapshot}`} className="mt-2 flex flex-wrap gap-1.5">
                        {Array.from({ length: splitCount }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            aria-pressed={(billOf[item.id] ?? 1) === n}
                            disabled={splitBusy}
                            onClick={() => setBillOf((prev) => ({ ...prev, [item.id]: n }))}
                            className={cn(
                              "min-h-10 rounded-lg border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                              (billOf[item.id] ?? 1) === n
                                ? "border-blue-600 bg-blue-50 text-blue-900"
                                : "border-slate-200 text-slate-700 hover:bg-slate-50",
                            )}
                          >
                            Bill {n}
                          </button>
                        ))}
                      </div>
                    </li>
                  ))
                : null}
            </ul>
            {splitPlan?.ok ? (
              <ul className="space-y-1 rounded-xl bg-emerald-50 px-4 py-3 text-sm">
                {splitPlan.totals.map((total, i) => (
                  <li key={i} className="flex justify-between font-medium text-emerald-950">
                    <span>Bill {i + 1}</span>
                    <span className="tabular-nums">{formatPricingAmount(total, currency)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <HmsAlert message={splitPlan && !splitPlan.ok ? splitPlan.error : ""} />
          </div>
          <SheetFooter className="border-t border-slate-100">
            <Button
              type="button"
              disabled={!splitPlan?.ok || splitBusy}
              className="gap-1.5"
              onClick={() => void confirmSplit()}
            >
              {splitBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {splitPlan?.ok ? `Split into ${splitPlan.bills.length} bills` : "Split bill"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={mergeSource !== null}
        onOpenChange={(open) => {
          if (!open && !mergeBusy) {
            setMergeSource(null);
            setMergeTargetId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Combine #{mergeSource?.order_number} with another bill</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-sm text-slate-600">
                <p>Every item on #{mergeSource?.order_number} moves to the bill you choose. Kitchen progress is kept.</p>
                <ul className="max-h-64 space-y-2 overflow-y-auto">
                  {mergeCandidates.map((o) => (
                    <li key={o.id}>
                      <button
                        type="button"
                        aria-pressed={mergeTargetId === o.id}
                        disabled={mergeBusy}
                        onClick={() => setMergeTargetId(o.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                          mergeTargetId === o.id ? "border-blue-600 bg-blue-50" : "border-slate-200 hover:bg-slate-50",
                        )}
                      >
                        <span className="text-slate-900">
                          <span className="font-semibold">#{o.order_number}</span>
                          <span className="text-slate-600"> · {o.table_code ?? o.tab_label ?? o.outlet_name}</span>
                        </span>
                        <span className="tabular-nums text-slate-800">{formatPricingAmount(o.subtotal, currency)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mergeBusy}>Back</AlertDialogCancel>
            <Button type="button" disabled={!mergeTargetId || mergeBusy} className="gap-1.5" onClick={() => void confirmMerge()}>
              {mergeBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Combine bills
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
            const fireLoading = busyKeys.has(busyKey(order.id, "fire"));
            const orderBusy =
              chargeLoading || posLoading || cancelLoading || sendLoading || serveLoading || fireLoading;
            const courses = summariseCourses(order.items).filter((c) => c.course >= 1);
            const heldCourses = courses.filter((c) => c.held > 0);
            const showCourses = !notSentFor(order) && (courses.length > 1 || heldCourses.length > 0);
            const notSent = order.status === "open";
            const kitchenDone = isKitchenWorkComplete(order.items);
            const fullyServed = isOrderFullyServed(order.items);
            const showMarkServed = canMarkOrderServed(order);
            // Paid before the kitchen finished — settlement_method is set but the
            // order hasn't closed yet (it's still on the kitchen board). Don't
            // offer to charge/pay it again.
            const alreadyPaid = Boolean(order.settlement_method);
            const canSettle = !alreadyPaid && order.subtotal > 0;
            // Part paid: only more payments are allowed; the bill is frozen.
            const partPaid = !alreadyPaid && order.paid_amount > 0;
            // Lines can be removed or given free only before any payment.
            const canAdjust = canCancel && !alreadyPaid && !partPaid;
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
                      {order.bill_number > 1 || orders.some((o) => o.split_from_order_id === order.id) ? (
                        <HmsPill tone="blue">Bill {order.bill_number}</HmsPill>
                      ) : null}
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
                    {order.service_charge_amount > 0 || order.levy_amount > 0 || order.vat_amount > 0 ? (
                      <p className="text-right text-xs text-slate-600">
                        Items {formatPricingAmount(order.items_total, currency)}
                        {order.service_charge_amount > 0 ? ` · service ${formatPricingAmount(order.service_charge_amount, currency)}` : ""}
                        {order.levy_amount > 0 ? ` · levy ${formatPricingAmount(order.levy_amount, currency)}` : ""}
                        {order.vat_amount > 0 ? ` · VAT ${formatPricingAmount(order.vat_amount, currency)}` : ""}
                        {order.prices_include_tax && (order.levy_amount > 0 || order.vat_amount > 0) ? " (taxes in prices)" : ""}
                        {order.service_charge_amount > 0 && canCancel && !order.settlement_method && order.paid_amount === 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setWaiveTarget(order);
                              setWaiveReason("");
                              setManagerPin("");
                              setWaiveError(null);
                            }}
                            className="ml-1.5 font-medium text-blue-700 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                          >
                            Waive service<span className="sr-only"> charge on #{order.order_number}</span>
                          </button>
                        ) : null}
                      </p>
                    ) : null}
                    {order.service_charge_waived_reason ? (
                      <p className="text-right text-xs text-slate-600">Service charge waived · {order.service_charge_waived_reason}</p>
                    ) : null}
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
                    {partPaid ? (
                      <HmsPill tone="amber">Part paid · {formatPricingAmount(leftToPay(order), currency)} left</HmsPill>
                    ) : null}
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm text-slate-800">
                  {order.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2">
                      <span className={cn(item.kitchen_status === "voided" && "text-slate-500 line-through")}>
                        {item.quantity}× {item.name_snapshot}
                        {item.seat ? <span className="text-slate-600"> · seat {item.seat}</span> : null}
                        {item.modifiers?.length ? (
                          <span className="text-slate-600">
                            {" "}
                            ({item.modifiers.map((m) => m.option_name).join(", ")})
                          </span>
                        ) : null}
                        {item.notes ? (
                          <span className="block text-sm italic text-amber-900">Note: {item.notes}</span>
                        ) : null}
                      </span>
                      {!notSent && !item.fired_at && item.kitchen_status === "pending" ? (
                        <HmsPill tone="amber">Held · {courseLabel(item.course)}</HmsPill>
                      ) : (
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
                      )}
                      {item.kitchen_status === "voided" && item.void_reason ? (
                        <span className="text-xs text-slate-600">{item.void_reason}</span>
                      ) : null}
                      {item.comped_at ? (
                        <HmsPill tone="blue">
                          Free{item.original_price ? ` (was ${formatPricingAmount(item.original_price, currency)})` : ""}
                          {item.comp_reason ? ` · ${item.comp_reason}` : ""}
                        </HmsPill>
                      ) : null}
                      {canAdjust && item.kitchen_status !== "voided" ? (
                        <span className="ml-auto flex gap-1">
                          {!item.comped_at ? (
                            <button
                              type="button"
                              disabled={orderBusy}
                              onClick={() => openLineAction(order, item, "comp")}
                              className={hmsButton.quiet}
                            >
                              Free<span className="sr-only"> {item.name_snapshot}</span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={orderBusy}
                            onClick={() => openLineAction(order, item, "void")}
                            className={hmsButton.danger}
                          >
                            Remove<span className="sr-only"> {item.name_snapshot}</span>
                          </button>
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {showCourses ? (
                  <div className="mt-3 rounded-xl border border-slate-200 bg-white/80 p-3">
                    <p className="mb-2 text-sm font-medium text-slate-800">Courses</p>
                    <ul className="space-y-1.5">
                      {courses.map((c) => (
                        <li key={c.course} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-slate-800">
                            <span className="font-semibold">{c.label}</span>
                            <span className="text-slate-600">
                              {" · "}
                              {c.held === c.total
                                ? `${c.total} held`
                                : c.served === c.total
                                  ? "served"
                                  : `fired ${sinceLabel(c.firedAt, now)} · ${c.ready + c.served} of ${c.total} ready`}
                            </span>
                          </span>
                          {c.held > 0 ? (
                            <button
                              type="button"
                              disabled={orderBusy}
                              onClick={() => void fireCourse(order.id, c.course, c.label)}
                              className={hmsButton.small}
                            >
                              {fireLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                              ) : (
                                <Flame className="h-4 w-4 text-orange-600" aria-hidden />
                              )}
                              Fire {c.label.toLowerCase()}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    {heldCourses.length > 1 ? (
                      <button
                        type="button"
                        disabled={orderBusy}
                        onClick={() => void fireCourse(order.id, "all", "Every held course")}
                        className={cn(hmsButton.quiet, "mt-1")}
                      >
                        Fire everything now
                      </button>
                    ) : null}
                  </div>
                ) : null}
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
                  {canSettle && !partPaid ? (
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
                  {canSettle ? (
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
                      {partPaid ? "Take the rest" : "PoS / Cash"} · {formatPricingAmount(leftToPay(order), currency)}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openPrint(receiptPrintUrl(slug, order.id))}
                    className={hmsButton.secondary}
                  >
                    <Printer className="h-4 w-4 text-slate-600" aria-hidden />
                    {order.settled_at ? "Print receipt" : "Print bill"}
                  </button>
                  {order.table_id || order.outlet_type === "restaurant" ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => void openMove(order)}
                      className={hmsButton.secondary}
                    >
                      <ArrowRightLeft className="h-4 w-4 text-slate-600" aria-hidden />
                      {order.table_id ? "Move table" : "Seat at a table"}
                    </button>
                  ) : null}
                  {!alreadyPaid && !partPaid && splittableItems(order.items).length >= 2 ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => openSplit(order)}
                      className={hmsButton.secondary}
                    >
                      <Split className="h-4 w-4 text-slate-600" aria-hidden />
                      Split bill
                    </button>
                  ) : null}
                  {!alreadyPaid && !partPaid && orders.some((o) => o.id !== order.id && !mergeBlockReason(o, order)) ? (
                    <button
                      type="button"
                      disabled={orderBusy}
                      onClick={() => {
                        setMergeSource(order);
                        setMergeTargetId(null);
                      }}
                      className={hmsButton.secondary}
                    >
                      <Combine className="h-4 w-4 text-slate-600" aria-hidden />
                      Combine with…
                    </button>
                  ) : null}
                  {canCancel && !alreadyPaid && !partPaid ? (
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
