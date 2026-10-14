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
import { Banknote, BedDouble, Hourglass } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile } from "@/components/hms/hms-ui";
import { HmsFilterChips } from "@/components/hms/hms-ui-client";

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

// Locale and timeZone are pinned (not left to the runtime default) so the
// server-rendered markup always matches what the client re-renders — an
// empty/omitted locale resolves differently on Node (SSR) vs the browser
// (CSR), which is a classic hydration-mismatch source.
function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function emptyLabel(range: FbOrderHistoryRange) {
  const match = HISTORY_RANGES.find((r) => r.value === range);
  return `No tickets for ${match?.label.toLowerCase() ?? "this period"}`;
}

function fbPaymentStatus(row: FbOrderHistoryRow): { label: string; tone: "slate" | "green" | "amber" | "red" | "blue" } | null {
  if (row.status === "voided") return null;
  switch (row.settlement_method) {
    case "room_charge":
      return { label: "Room charge", tone: "amber" };
    case "pos":
    case "card":
    case "cash":
      return { label: "PoS", tone: "green" };
    default:
      break;
  }
  if (row.status !== "closed") {
    return { label: "Pending", tone: "red" };
  }
  return { label: "Unsettled", tone: "red" };
}

function orderStatusTone(status: string): "slate" | "green" | "red" | "blue" {
  if (status === "closed") return "green";
  if (status === "voided") return "red";
  return "blue";
}

const ORDER_STATUS_LABEL: Record<string, string> = {
  closed: "Completed",
  voided: "Cancelled",
};

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
  description = "Completed and cancelled tickets, for looking back. Nothing here can be changed.",
  eyebrow = "Restaurant & bar",
  historyApiPath = "/api/hotel/fb/orders/history",
}: {
  /** The department shown above the title. */
  eyebrow?: string;
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

  return (
    <div className="w-full space-y-5 px-4 py-6 sm:px-6">
      <HmsPageHeader eyebrow={eyebrow} meaning="food" title={title} description={description} />

      <HmsFilterChips<FbOrderHistoryRange>
        label="Time period"
        meaning="food"
        value={range}
        onChange={setRange}
        options={HISTORY_RANGES.map((option) => ({ value: option.value, label: option.label }))}
      />

      {showSummary ? (
        <HmsStatStrip label="Takings for this period" columns={3}>
          <HmsStatTile
            label="PoS / counter"
            value={formatPricingAmount(totals.pos, currency)}
            hint="Cash, card and PoS collected"
            icon={Banknote}
            meaning="money"
          />
          <HmsStatTile
            label="Charged to room"
            value={formatPricingAmount(totals.room, currency)}
            hint="Posted to guest folios"
            icon={BedDouble}
            meaning="guests"
          />
          <HmsStatTile
            label="Pending"
            value={formatPricingAmount(totals.pending, currency)}
            hint="Waiting to be settled"
            icon={Hourglass}
            meaning="attention"
            status={totals.pending > 0 ? "warning" : undefined}
            statusText="Waiting to be settled"
          />
        </HmsStatStrip>
      ) : null}

      {timingFilterEnabled ? (
        <HmsFilterChips<TimingFilter>
          label="Kitchen timing"
          meaning="food"
          value={timingFilter}
          onChange={setTimingFilter}
          options={TIMING_FILTERS.map((option) => ({
            value: option.value,
            label: option.label,
            count:
              option.value === "on_time"
                ? timingCounts.onTime
                : option.value === "late"
                  ? timingCounts.late
                  : null,
          }))}
        />
      ) : null}

      {showPaymentStatus ? (
        <HmsFilterChips<PaymentFilter>
          label="Payment"
          meaning="money"
          value={paymentFilter}
          onChange={setPaymentFilter}
          options={PAYMENT_FILTERS.map((option) => ({ value: option.value, label: option.label }))}
        />
      ) : null}

      {visibleRows.length === 0 ? (
        <HmsEmptyState
          art="page"
          meaning="food"
          title={emptyLabel(range)}
          description="Finished and cancelled tickets are listed here. Try a longer time period or another filter."
        />
      ) : (
        <HmsCard flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">{title}</caption>
              <thead className="bg-orange-50/60 text-left text-sm text-slate-700">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Order</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Table</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Items</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Sent</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Completed</th>
                  <th scope="col" className="px-4 py-3 font-semibold">{timeMode === "service" ? "Service time" : "Kitchen time"}</th>
                  {showPaymentStatus ? <th scope="col" className="px-4 py-3 font-semibold">Payment</th> : null}
                  {showAmountState ? <th scope="col" className="px-4 py-3 text-right font-semibold">Total</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => {
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
                  <tr key={row.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">#{row.order_number}</td>
                    <td className="px-4 py-3 text-slate-800">{row.table_label}</td>
                    <td className="px-4 py-3">
                      <HmsPill tone={orderStatusTone(row.status)}>
                        {ORDER_STATUS_LABEL[row.status] ?? row.status.replace(/_/g, " ")}
                      </HmsPill>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">{row.item_count}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatDate(completedAt ?? row.created_at)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatTime(row.sent_to_kitchen_at ?? row.created_at)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">
                      {formatTime(completedAt)}
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {timeMode === "service" ? (
                        <span className="font-medium text-slate-800">
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
                          {rowKitchenTimingStatus(row, threshold) === "late" ? <span className="ml-1">· Late</span> : null}
                        </span>
                      ) : (
                        <span className="font-medium text-slate-800">{formatKitchenTimeMinutes(timingRow)}</span>
                      )}
                    </td>
                    {showPaymentStatus ? (
                      <td className="px-4 py-3">
                        {payment ? <HmsPill tone={payment.tone}>{payment.label}</HmsPill> : <span className="text-slate-600">—</span>}
                      </td>
                    ) : null}
                    {showAmountState ? (
                      <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                        {formatPricingAmount(row.subtotal, currency)}
                      </td>
                    ) : null}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </HmsCard>
      )}
    </div>
  );
}
