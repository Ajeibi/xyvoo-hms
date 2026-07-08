"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDurationMinutes,
  formatKitchenTimeMinutes,
  kitchenTimeBadgeStyle,
  kitchenTimeMinutes,
  resolveOverdueMinutes,
} from "@/lib/hms/fb-order-timing";
import type { FbOrderHistoryRange } from "@/lib/hms/fb-orders";
import type { FbRoleCapabilities } from "@/lib/hms/fb-rbac";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { FbOrderHistoryRow } from "@/lib/hms/load-fb-pages";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { cn } from "@/lib/utils";

const HISTORY_RANGES: { value: FbOrderHistoryRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_week", label: "Last week" },
  { value: "last_2_weeks", label: "Last 2 weeks" },
  { value: "last_month", label: "Last month" },
];

type PaymentFilter = "all" | "pos" | "room_charge" | "pending";

const PAYMENT_FILTERS: { value: PaymentFilter; label: string }[] = [
  { value: "all", label: "All payments" },
  { value: "pos", label: "PoS / counter" },
  { value: "room_charge", label: "Charged to room" },
  { value: "pending", label: "Pending" },
];

function matchesPaymentFilter(row: FbOrderHistoryRow, filter: PaymentFilter) {
  if (filter === "all") return true;
  if (row.status === "voided") return false;
  const method = row.settlement_method;
  if (filter === "room_charge") return method === "room_charge";
  if (filter === "pos") return method === "cash" || method === "card" || method === "pos";
  return method == null;
}

type TimingFilter = "all" | "on_time" | "late";

const TIMING_FILTERS: { value: TimingFilter; label: string }[] = [
  { value: "all", label: "All timing" },
  { value: "on_time", label: "On time" },
  { value: "late", label: "Late" },
];

/** "on_time" if the kitchen finished within its target, "late" if it exceeded it, null if untimed. */
function rowKitchenTimingStatus(
  row: FbOrderHistoryRow,
  threshold: number | undefined,
): "on_time" | "late" | null {
  const mins = kitchenTimeMinutes(kitchenTimingRow(row));
  if (mins === null) return null;
  const effective = resolveOverdueMinutes(row.overdue_minutes ?? threshold);
  return mins >= effective ? "late" : "on_time";
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

function emptyLabel(range: FbOrderHistoryRange) {
  const match = HISTORY_RANGES.find((r) => r.value === range);
  return `No tickets for ${match?.label.toLowerCase() ?? "this period"}.`;
}

function fbPaymentStatus(row: FbOrderHistoryRow) {
  if (row.status === "voided") return { label: "—", className: "text-slate-400" };
  switch (row.settlement_method) {
    case "room_charge":
      return { label: "Room charge", className: "text-amber-700 font-medium" };
    case "pos":
    case "card":
    case "cash":
      return { label: "PoS", className: "text-emerald-700 font-medium" };
    default:
      break;
  }
  if (row.status !== "closed") {
    return { label: "Pending", className: "text-red-600 font-medium" };
  }
  return { label: "Unsettled", className: "text-red-500" };
}

function historyCompletedAt(row: FbOrderHistoryRow) {
  return row.history_at ?? row.closed_at ?? row.voided_at;
}

function kitchenTimingRow(row: FbOrderHistoryRow) {
  return {
    sent_to_kitchen_at: row.sent_to_kitchen_at,
    created_at: row.created_at,
    closed_at: row.kitchen_ready_at ?? row.kitchen_end_at ?? row.closed_at,
    voided_at: row.voided_at,
  };
}

function kitchenHistoryCompletedAt(row: FbOrderHistoryRow) {
  return row.kitchen_ready_at ?? row.kitchen_end_at ?? row.history_at ?? row.closed_at ?? row.voided_at;
}

/** F&B service window: kitchen "ready" → F&B "served"/"completed". null if not measurable. */
function fbServiceMinutes(row: FbOrderHistoryRow): number | null {
  if (!row.kitchen_ready_at) return null;
  const endIso = row.served_at ?? row.closed_at ?? row.voided_at;
  if (!endIso) return null;
  const start = new Date(row.kitchen_ready_at).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function FbOrderHistoryClient({
  slug,
  tenantId,
  currency,
  initial,
  showAmount = true,
  showPaymentStatus = false,
  showTimingFilter = true,
  timeMode = "kitchen",
  overdueMinutes,
  title = "Order history",
  description = "Completed and voided tickets (read-only).",
  historyApiPath = "/api/hotel/fb/orders/history",
}: {
  slug: string;
  tenantId: string;
  currency: string;
  initial: { rows: FbOrderHistoryRow[] };
  showAmount?: boolean;
  showPaymentStatus?: boolean;
  showTimingFilter?: boolean;
  /** "kitchen" = cook time (sent → ready). "service" = F&B window (ready → served). */
  timeMode?: "kitchen" | "service";
  overdueMinutes?: number;
  title?: string;
  description?: string;
  historyApiPath?: string;
}) {
  const [rows, setRows] = useState<FbOrderHistoryRow[]>(initial.rows);
  const [range, setRange] = useState<FbOrderHistoryRange>("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [timingFilter, setTimingFilter] = useState<TimingFilter>("all");
  const [showAmountState, setShowAmountState] = useState(showAmount);
  const [threshold, setThreshold] = useState<number | undefined>(overdueMinutes);

  const load = useCallback(async () => {
    const res = await fetch(
      `${historyApiPath}?slug=${encodeURIComponent(slug)}&range=${encodeURIComponent(range)}`,
    );
    const data = await res.json();
    if (res.ok) {
      setRows(data.orders ?? []);
      const caps = data.capabilities as FbRoleCapabilities | undefined;
      if (caps) setShowAmountState(showAmount && !caps.hidePrices);
      if (typeof data.kitchenOverdueMinutes === "number") {
        setThreshold(data.kitchenOverdueMinutes);
      }
    }
  }, [slug, range, historyApiPath, showAmount]);

  useFbRealtime(tenantId, () => void load());

  useEffect(() => {
    void load();
  }, [load]);

  const totals = useMemo(() => {
    let pos = 0;
    let room = 0;
    let pending = 0;
    for (const row of rows) {
      if (row.status === "voided") continue;
      if (row.settlement_method === "room_charge") {
        room += row.subtotal;
      } else if (
        row.settlement_method === "cash" ||
        row.settlement_method === "card" ||
        row.settlement_method === "pos"
      ) {
        pos += row.subtotal;
      } else {
        pending += row.subtotal;
      }
    }
    return { pos, room, pending };
  }, [rows]);

  const showSummary = showPaymentStatus && showAmountState;
  const timingFilterEnabled = showTimingFilter && timeMode === "kitchen";

  const timingCounts = useMemo(() => {
    let onTime = 0;
    let late = 0;
    for (const row of rows) {
      const status = rowKitchenTimingStatus(row, threshold);
      if (status === "on_time") onTime += 1;
      else if (status === "late") late += 1;
    }
    return { onTime, late };
  }, [rows, threshold]);

  const visibleRows = useMemo(() => {
    return rows.filter((row) => {
      if (showPaymentStatus && paymentFilter !== "all" && !matchesPaymentFilter(row, paymentFilter)) {
        return false;
      }
      if (timingFilterEnabled && timingFilter !== "all") {
        if (rowKitchenTimingStatus(row, threshold) !== timingFilter) return false;
      }
      return true;
    });
  }, [rows, paymentFilter, showPaymentStatus, timingFilter, timingFilterEnabled, threshold]);

  const colSpan = (showAmountState ? 1 : 0) + (showPaymentStatus ? 1 : 0) + 7;

  return (
    <div className="w-full px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {HISTORY_RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                range === option.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {showSummary ? (
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
              PoS / counter
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-emerald-900">
              {formatPricingAmount(totals.pos, currency)}
            </p>
            <p className="text-xs text-emerald-700/80">Cash, card &amp; POS collected</p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-amber-700">
              Charged to room
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-amber-900">
              {formatPricingAmount(totals.room, currency)}
            </p>
            <p className="text-xs text-amber-700/80">Posted to guest folios</p>
          </div>
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-red-700">
              Pending
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-red-900">
              {formatPricingAmount(totals.pending, currency)}
            </p>
            <p className="text-xs text-red-700/80">Awaiting settlement</p>
          </div>
        </div>
      ) : null}

      {timingFilterEnabled ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {TIMING_FILTERS.map((option) => {
            const count =
              option.value === "on_time"
                ? timingCounts.onTime
                : option.value === "late"
                  ? timingCounts.late
                  : null;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTimingFilter(option.value)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                  timingFilter === option.value
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {option.label}
                {count !== null ? (
                  <span
                    className={cn(
                      "ml-1.5 tabular-nums",
                      timingFilter === option.value ? "text-blue-100" : "text-slate-400",
                    )}
                  >
                    {count}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {showPaymentStatus ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {PAYMENT_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPaymentFilter(option.value)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm font-medium transition-colors",
                paymentFilter === option.value
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Order</th>
                <th className="px-4 py-3">Table</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">{timeMode === "service" ? "Service time" : "Kitchen time"}</th>
                {showPaymentStatus ? <th className="px-4 py-3">Payment</th> : null}
                {showAmountState ? <th className="px-4 py-3 text-right">Total</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="px-4 py-8 text-center text-slate-500">
                    {emptyLabel(range)}
                  </td>
                </tr>
              ) : (
                visibleRows.map((row) => {
                  const payment = showPaymentStatus ? fbPaymentStatus(row) : null;
                  const completedAt =
                    timeMode === "kitchen"
                      ? kitchenHistoryCompletedAt(row)
                      : historyCompletedAt(row);
                  const timingRow = kitchenTimingRow(row);
                  const kitchenMins = kitchenTimeMinutes(timingRow);
                  const badge =
                    timeMode === "service"
                      ? null
                      : kitchenTimeBadgeStyle(kitchenMins, row.overdue_minutes ?? threshold);
                  const serviceMins = timeMode === "service" ? fbServiceMinutes(row) : null;
                  return (
                  <tr key={row.id}>
                    <td className="px-4 py-3 font-medium">#{row.order_number}</td>
                    <td className="px-4 py-3">{row.table_label}</td>
                    <td className="px-4 py-3 capitalize">{row.status}</td>
                    <td className="px-4 py-3 tabular-nums">{row.item_count}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatDate(completedAt ?? row.created_at)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(row.sent_to_kitchen_at ?? row.created_at)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">
                      {formatTime(completedAt)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {timeMode === "service" ? (
                        <span className="font-medium text-slate-700">
                          {serviceMins === null ? "—" : formatDurationMinutes(serviceMins)}
                        </span>
                      ) : badge ? (
                        <span
                          className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                          style={{
                            backgroundColor: badge.backgroundColor,
                            borderColor: badge.borderColor,
                            color: badge.color,
                          }}
                        >
                          {formatKitchenTimeMinutes(timingRow)}
                        </span>
                      ) : (
                        <span className="font-medium">{formatKitchenTimeMinutes(timingRow)}</span>
                      )}
                    </td>
                    {showPaymentStatus && payment ? (
                      <td className={cn("px-4 py-3", payment.className)}>{payment.label}</td>
                    ) : null}
                    {showAmountState ? (
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatPricingAmount(row.subtotal, currency)}
                      </td>
                    ) : null}
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
