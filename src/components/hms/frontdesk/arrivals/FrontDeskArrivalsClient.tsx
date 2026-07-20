"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CalendarOff, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  FRONT_DESK_ACCENT_BORDER_CLASS,
  FRONT_DESK_ACCENT_WELL_CLASS,
} from "@/lib/hms/frontdesk-capabilities";
import type {
  ArrivalSummary,
  ArrivalWorkbenchRow,
  ArrivalsWorkbenchPayload,
} from "@/lib/hms/arrivals-workbench";
import type { CheckInStaffOption } from "@/lib/hms/check-in-staff-options";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";
import { PAYMENT_DOT_CLASS, PAYMENT_STATUS_LABEL } from "@/components/hms/frontdesk/board/payment-styles";
import { PaymentLegend } from "@/components/hms/frontdesk/board/PaymentLegend";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { FrontDeskArrivalDetailSheet } from "./FrontDeskArrivalDetailSheet";
import { FrontDeskReservationCheckInDialog } from "./FrontDeskReservationCheckInDialog";
import { FrontDeskArrivalTimeline } from "./FrontDeskArrivalTimeline";
import { FrontDeskAssignRoomDialog } from "./FrontDeskAssignRoomDialog";
import { FrontDeskArrivalRowActions } from "./FrontDeskArrivalRowActions";
import {
  ArrivalMovementBadge,
  arrivalRowSurfaceClasses,
} from "./arrival-movement-ui";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const READINESS_LABEL: Record<string, string> = {
  ready: "Ready",
  dirty: "Dirty",
  cleaning: "Cleaning",
  inspected: "Inspected",
  maintenance: "Maintenance",
};

const PROGRESS_LABEL: Record<string, string> = {
  pending: "Pending",
  checked_in: "Checked in",
  no_show: "No-show",
  cancelled: "Cancelled",
};

function formatUtcDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatUtcDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

const TH = "px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const TD = "px-4 py-4 align-middle text-sm text-slate-700";

const FILTER_LABEL =
  "mb-2 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const FILTER_SELECT =
  "h-10 w-full cursor-pointer rounded-lg border border-input bg-white px-3 text-sm text-slate-800 shadow-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const ARRIVAL_STATUS_FILTER_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked in" },
  { value: "no_show", label: "No-show" },
  { value: "cancelled", label: "Cancelled" },
];

const ARRIVAL_PAYMENT_FILTER_OPTIONS = [
  { value: "", label: "All payments" },
  { value: "paid", label: "Paid" },
  { value: "partial", label: "Partial" },
  { value: "unpaid", label: "Unpaid" },
  { value: "refund_pending", label: "Refund pending" },
];

const ARRIVAL_SOURCE_FILTER_OPTIONS = [
  { value: "", label: "All sources" },
  { value: "walk_in", label: "Walk-in" },
  { value: "website", label: "Website" },
  { value: "ota", label: "OTA" },
  { value: "phone", label: "Phone" },
  { value: "travel_agent", label: "Travel agent" },
  { value: "referral", label: "Referral" },
];

const ARRIVAL_READINESS_FILTER_OPTIONS = [
  { value: "", label: "Any readiness" },
  { value: "ready", label: "Ready" },
  { value: "dirty", label: "Dirty" },
  { value: "cleaning", label: "Cleaning" },
  { value: "maintenance", label: "Maintenance" },
];

function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className={FILTER_LABEL}>{label}</span>
      {children}
    </div>
  );
}

type SortKey = "arrivalAt" | "guestName" | "confirmationCode";

const ARRIVALS_PAGE_SIZE = 5;

function movementBadgeVariant(
  highlight: ArrivalWorkbenchRow["highlight"],
): "soon" | "overdue" | null {
  if (highlight === "soon") return "soon";
  if (highlight === "overdue") return "overdue";
  return null;
}

export function FrontDeskArrivalsClient({
  slug,
  currency,
  tenantId,
  initial,
  capabilities,
  checkInStaffOptions,
  defaultCheckedInByUserId,
}: {
  slug: string;
  currency: string;
  tenantId: string;
  initial: ArrivalsWorkbenchPayload;
  capabilities: ArrivalsRoleCapabilities;
  checkInStaffOptions: CheckInStaffOption[];
  defaultCheckedInByUserId: string | null;
}) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [preset, setPreset] = useState("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("");
  const [readinessFilter, setReadinessFilter] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("arrivalAt");
  const [sortAsc, setSortAsc] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [checkInRow, setCheckInRow] = useState<ArrivalWorkbenchRow | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [assignRow, setAssignRow] = useState<ArrivalWorkbenchRow | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [showTimeline, setShowTimeline] = useState(true);
  const [page, setPage] = useState(1);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ slug, preset });
    if (preset === "custom" && customStart && customEnd) {
      params.set("start", customStart);
      params.set("end", customEnd);
    }
    if (search.trim()) params.set("q", search.trim());
    if (statusFilter) params.set("status", statusFilter);
    if (paymentFilter) params.set("payment", paymentFilter);
    if (readinessFilter) params.set("roomReadiness", readinessFilter);
    if (vipOnly) params.set("vipOnly", "true");
    if (sourceFilter) params.set("source", sourceFilter);
    try {
      const res = await fetch(`/api/hotel/frontdesk/arrivals?${params}`);
      const json = await res.json();
      if (!json.error) {
        setData(json);
        setPage(1);
      }
    } finally {
      setLoading(false);
    }
  }, [
    slug,
    preset,
    customStart,
    customEnd,
    search,
    statusFilter,
    paymentFilter,
    readinessFilter,
    vipOnly,
    sourceFilter,
  ]);

  useEffect(() => {
    const t = setTimeout(() => {
      refresh();
    }, 300);
    return () => clearTimeout(t);
  }, [refresh]);

  useFrontDeskRealtime(tenantId, true, refresh);

  const sortedRows = useMemo(() => {
    const rows = [...data.rows];
    rows.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "arrivalAt") cmp = a.arrivalAt.localeCompare(b.arrivalAt);
      else if (sortKey === "guestName") cmp = a.guestName.localeCompare(b.guestName);
      else cmp = a.confirmationCode.localeCompare(b.confirmationCode);
      return sortAsc ? cmp : -cmp;
    });
    return rows;
  }, [data.rows, sortKey, sortAsc]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / ARRIVALS_PAGE_SIZE));
  // Clamped inline (not via effect-driven setState) for whenever a filter change shrinks the
  // result set faster than the explicit resets below catch it.
  const currentPage = Math.min(page, totalPages);

  const pageRows = useMemo(
    () => sortedRows.slice((currentPage - 1) * ARRIVALS_PAGE_SIZE, currentPage * ARRIVALS_PAGE_SIZE),
    [sortedRows, currentPage],
  );

  const hasActiveFilters =
    search.trim() !== "" ||
    statusFilter !== "" ||
    paymentFilter !== "" ||
    readinessFilter !== "" ||
    sourceFilter !== "" ||
    vipOnly ||
    preset === "custom";

  const allVisibleSelected =
    pageRows.length > 0 && pageRows.every((r) => selectedIds.has(r.id));
  const someVisibleSelected = pageRows.some((r) => selectedIds.has(r.id));

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [someVisibleSelected, allVisibleSelected]);

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setPaymentFilter("");
    setReadinessFilter("");
    setSourceFilter("");
    setVipOnly(false);
    setPreset("today");
    setCustomStart("");
    setCustomEnd("");
  }

  function toggleSelectAllVisible() {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      return;
    }
    setSelectedIds(new Set(pageRows.map((r) => r.id)));
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
    setPage(1);
  }

  function openDetail(row: ArrivalWorkbenchRow) {
    setDetailId(row.id);
    setDetailOpen(true);
  }

  function openCheckIn(row: ArrivalWorkbenchRow) {
    setCheckInRow(row);
    setCheckInOpen(true);
  }

  function openAssign(row: ArrivalWorkbenchRow) {
    setAssignRow(row);
    setAssignOpen(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulkExport() {
    if (!capabilities.canBulkActions || selectedIds.size === 0) return;
    const res = await fetch("/api/hotel/frontdesk/arrivals/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationIds: [...selectedIds],
        action: "export_codes",
      }),
    });
    const json = await res.json();
    if (json.codes) {
      const text = json.codes.map((c: { confirmationCode: string }) => c.confirmationCode).join("\n");
      await navigator.clipboard.writeText(text);
      toastSuccess(`Copied ${json.codes.length} confirmation code(s)`);
    } else if (!res.ok) {
      toastError("Export failed", json.error ?? "Try again.");
    }
  }

  async function bulkReopen() {
    if (!capabilities.canBulkActions || selectedIds.size === 0) return;
    const res = await fetch("/api/hotel/frontdesk/arrivals/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationIds: [...selectedIds],
        action: "mark_confirmed",
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      toastError("Bulk reopen failed", json.error ?? "Try again.");
      return;
    }
    toastSuccess(`Reopened ${selectedIds.size} arrival(s)`);
    setSelectedIds(new Set());
    refresh();
  }

  return (
    <div className="space-y-8 p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Front desk</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Arrivals & check-in</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {data.rangeLabel} · Manage expected arrivals, assign rooms, and check guests in.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
          <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </header>

      <ArrivalsSummaryCards summary={data.summary} preset={preset} />

      <section className="-mx-2 rounded-2xl border border-slate-200 bg-white shadow-sm sm:mx-0">
        <div className="space-y-6 p-6">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Arrival window</h2>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div
                className="inline-flex flex-wrap rounded-xl bg-slate-100/90 p-1.5 ring-1 ring-slate-200/60"
                role="tablist"
                aria-label="Date preset"
              >
                {(["today", "tomorrow", "week", "custom"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    role="tab"
                    aria-selected={preset === p}
                    onClick={() => setPreset(p)}
                    className={cn(
                      "cursor-pointer rounded-lg px-5 py-2.5 text-sm font-medium transition-all",
                      preset === p
                        ? "bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80"
                        : "text-slate-600 hover:text-slate-900",
                    )}
                  >
                    {p === "custom" ? "Custom" : p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                ))}
              </div>
              {preset === "custom" ? (
                <div className="flex flex-wrap gap-4">
                  <FilterField label="From" className="min-w-[160px]">
                    <Input
                      type="date"
                      className="h-10 bg-white"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </FilterField>
                  <FilterField label="To" className="min-w-[160px]">
                    <Input
                      type="date"
                      className="h-10 bg-white"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </FilterField>
                </div>
              ) : (
                <p className="text-sm text-slate-500 lg:pb-2">{data.rangeLabel}</p>
              )}
            </div>
          </div>

          <Separator className="bg-slate-200" />

          <FilterField label="Search arrivals">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="search"
                placeholder="Name, confirmation, phone, email, room…"
                className="h-11 bg-white pl-10 text-base md:text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </FilterField>

          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Refine list</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <FilterField label="Status">
                <FrontDeskPopoverSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="All statuses"
                  options={ARRIVAL_STATUS_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField label="Payment">
                <FrontDeskPopoverSelect
                  value={paymentFilter}
                  onChange={setPaymentFilter}
                  placeholder="All payments"
                  options={ARRIVAL_PAYMENT_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField label="Source">
                <FrontDeskPopoverSelect
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  placeholder="All sources"
                  options={ARRIVAL_SOURCE_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField label="Room readiness">
                <FrontDeskPopoverSelect
                  value={readinessFilter}
                  onChange={setReadinessFilter}
                  placeholder="Any readiness"
                  options={ARRIVAL_READINESS_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField label="Guest type">
                <button
                  type="button"
                  onClick={() => setVipOnly((v) => !v)}
                  className={cn(
                    FILTER_SELECT,
                    "flex items-center justify-center font-medium transition-colors",
                    vipOnly
                      ? "border-amber-300 bg-amber-50 text-amber-900 ring-amber-200/60"
                      : "text-slate-600 hover:bg-slate-50",
                  )}
                >
                  {vipOnly ? "VIP only · On" : "VIP only · Off"}
                </button>
              </FilterField>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-6 py-3.5">
          <p className="text-xs text-slate-500">
            Click a row for full guest details · Late arrivals show a red edge and{" "}
            <span className="font-medium text-red-700">Delayed</span> badge
          </p>
          {hasActiveFilters ? (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-slate-600" onClick={clearFilters}>
              Clear all filters
            </Button>
          ) : null}
        </div>
        <div className="border-t border-slate-100 px-6 py-3">
          <PaymentLegend />
          <p className="mt-1 text-[11px] text-slate-400">Dot shown next to the Balance amount for each arrival.</p>
        </div>
      </section>

      {capabilities.canBulkActions && selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
          <p className="text-sm font-medium text-blue-900">
            {selectedIds.size} reservation{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => bulkExport()}>
              Copy codes
            </Button>
            <Button type="button" size="sm" variant="outline" className="bg-white" onClick={() => bulkReopen()}>
              Reopen selected
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </div>
        </div>
      ) : null}

      <div className="thin-scrollbar relative rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[1px]"
            aria-hidden
          >
            <RefreshCw className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        ) : null}
        {sortedRows.length === 0 && !loading ? (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <CalendarOff className="h-10 w-10 text-slate-300" aria-hidden />
            <div>
              <p className="font-medium text-slate-800">No arrivals in this view</p>
              <p className="mt-1 text-sm text-slate-500">
                {hasActiveFilters
                  ? "Try clearing filters or choosing a wider date range."
                  : "There are no reservations arriving for the selected period."}
              </p>
            </div>
            {hasActiveFilters ? (
              <Button type="button" size="sm" variant="outline" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : null}
          </div>
        ) : (
        <div className="overflow-x-auto pb-0.5">
        <table className="min-w-[1900px] w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100/80">
              {capabilities.canBulkActions ? (
                <th className={cn(TH, "w-12")}>
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="cursor-pointer rounded border-slate-300"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible arrivals"
                    disabled={sortedRows.length === 0}
                  />
                </th>
              ) : null}
              <th className={cn(TH, "min-w-[120px]")}>
                <button
                  type="button"
                  className="cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("confirmationCode")}
                >
                  Ref
                </button>
              </th>
              <th className={cn(TH, "min-w-[100px]")}>Booked</th>
              <th className={cn(TH, "min-w-[260px]")}>
                <button
                  type="button"
                  className="cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("guestName")}
                >
                  Guest
                </button>
              </th>
              <th className={cn(TH, "min-w-[240px]")}>Contact</th>
              <th className={cn(TH, "min-w-[160px]")}>
                <button
                  type="button"
                  className="cursor-pointer hover:text-slate-800"
                  onClick={() => toggleSort("arrivalAt")}
                >
                  Arrival
                </button>
              </th>
              <th className={cn(TH, "min-w-[110px]")}>Departure</th>
              <th className={cn(TH, "min-w-[72px] text-center")}>Nights</th>
              <th className={cn(TH, "min-w-[180px]")}>Type / floor</th>
              <th className={cn(TH, "min-w-[90px]")}>Room</th>
              <th className={cn(TH, "min-w-[64px] text-center")}>Party</th>
              <th className={cn(TH, "min-w-[100px] text-right")}>Total</th>
              <th className={cn(TH, "min-w-[100px] text-right")}>Paid</th>
              <th className={cn(TH, "min-w-[120px] text-right")}>Balance</th>
              <th className={cn(TH, "min-w-[100px]")}>Status</th>
              <th className={cn(TH, "min-w-[88px]")}>HK</th>
              <th className={cn(TH, "min-w-[100px]")}>Progress</th>
              <th className={cn(TH, "min-w-[88px]")}>Requests</th>
              <th className={cn(TH, "sticky right-0 z-10 min-w-[168px] bg-slate-100/95 backdrop-blur-sm text-right")}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row, index) => {
                const surface = arrivalRowSurfaceClasses(row.highlight, index);
                const movement = movementBadgeVariant(row.highlight);
                return (
                  <tr
                    key={row.id}
                    tabIndex={0}
                    title="Open guest details"
                    onClick={() => openDetail(row)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(row);
                      }
                    }}
                    className={cn(
                      "cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-100/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500",
                      surface,
                    )}
                  >
                    {capabilities.canBulkActions ? (
                      <td className={cn(TD, surface)} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="cursor-pointer rounded border-slate-300"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.guestName}`}
                        />
                      </td>
                    ) : null}
                    <td className={cn(TD, "font-mono text-xs font-medium text-slate-800", surface)}>
                      {row.confirmationCode}
                    </td>
                    <td className={cn(TD, "text-xs text-slate-600", surface)}>{formatUtcDate(row.bookingDate)}</td>
                    <td className={cn(TD, "whitespace-nowrap", surface)}>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-slate-900">{row.guestName}</span>
                          {row.isVip ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
                              VIP
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-500">{row.bookingSourceLabel}</p>
                      </div>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-xs leading-relaxed text-slate-600", surface)}>
                      <div>{row.phone}</div>
                      <div className="text-slate-500">{row.email}</div>
                      <div className="font-medium text-slate-700">{row.nationality}</div>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-xs", surface)}>
                      <div className="flex flex-col gap-1.5">
                        <span className="font-medium text-slate-900">{formatUtcDateTime(row.arrivalAt)}</span>
                        <ArrivalMovementBadge variant={movement} />
                      </div>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-xs", surface)}>{formatUtcDate(row.departureAt)}</td>
                    <td className={cn(TD, "text-center text-sm font-medium tabular-nums", surface)}>{row.nights}</td>
                    <td className={cn(TD, "whitespace-nowrap text-xs", surface)}>
                      <div className="font-medium">{row.roomTypeCode}</div>
                      {row.floor != null ? <div className="text-slate-500">Floor {row.floor}</div> : null}
                    </td>
                    <td className={cn(TD, "font-medium text-slate-900", surface)}>{row.roomCode ?? "—"}</td>
                    <td className={cn(TD, "text-center tabular-nums", surface)}>{row.partySize}</td>
                    <td className={cn(TD, "whitespace-nowrap text-right text-xs tabular-nums", surface)}>
                      {formatPricingAmount(row.totalCharges, currency)}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-right text-xs tabular-nums text-slate-600", surface)}>
                      {formatPricingAmount(row.amountPaid, currency)}
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-right", surface)}>
                      <span className="inline-flex items-center justify-end gap-2 text-xs font-medium tabular-nums">
                        <span
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${PAYMENT_DOT_CLASS[row.paymentStatus]}`}
                          title={PAYMENT_STATUS_LABEL[row.paymentStatus]}
                        />
                        {formatPricingAmount(row.outstandingBalance, currency)}
                      </span>
                    </td>
                    <td className={cn(TD, "text-xs", surface)}>
                      <span className="inline-flex rounded-md bg-slate-200/60 px-2 py-1 font-medium text-slate-800">
                        {STATUS_LABEL[row.status] ?? row.status}
                      </span>
                    </td>
                    <td className={cn(TD, "text-xs", surface)}>
                      {row.roomReadiness ? (
                        <span className="text-slate-700">{READINESS_LABEL[row.roomReadiness] ?? row.roomReadiness}</span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className={cn(TD, "text-xs", surface)}>
                      {PROGRESS_LABEL[row.checkInProgress] ?? row.checkInProgress}
                    </td>
                    <td className={cn(TD, "text-xs", surface)}>
                      {row.openRequestCount > 0 ? (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-900">
                          {row.openRequestCount} open
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td
                      className={cn(
                        TD,
                        "sticky right-0 z-10 border-l border-slate-200/80 shadow-[-8px_0_12px_-8px_rgba(0,0,0,0.06)]",
                        surface,
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <FrontDeskArrivalRowActions
                        slug={slug}
                        row={row}
                        capabilities={capabilities}
                        onDetail={() => openDetail(row)}
                        onAssign={() => openAssign(row)}
                        onCheckIn={() => openCheckIn(row)}
                      />
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
        </div>
        )}
      </div>

      {sortedRows.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {(currentPage - 1) * ARRIVALS_PAGE_SIZE + 1}–
            {Math.min(currentPage * ARRIVALS_PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              Previous
            </Button>
            <span className="px-2 text-xs font-medium text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <section>
        <button
          type="button"
          className="cursor-pointer text-sm font-semibold text-slate-900"
          onClick={() => setShowTimeline(!showTimeline)}
        >
          Arrival timeline {showTimeline ? "▾" : "▸"}
        </button>
        {showTimeline ? (
          <div className="mt-4">
            <FrontDeskArrivalTimeline
              slug={slug}
              preset={preset}
              customStart={customStart}
              customEnd={customEnd}
              onSelectReservation={(id) => {
                setDetailId(id);
                setDetailOpen(true);
              }}
            />
          </div>
        ) : null}
      </section>

      <FrontDeskArrivalDetailSheet
        slug={slug}
        reservationId={detailId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onCheckIn={() => {
          const row = data.rows.find((r) => r.id === detailId);
          if (row) openCheckIn(row);
        }}
        onRefresh={refresh}
        capabilities={capabilities}
        currency={currency}
        onAssignRoom={() => {
          const row = data.rows.find((r) => r.id === detailId);
          if (row) openAssign(row);
        }}
      />

      <FrontDeskAssignRoomDialog
        slug={slug}
        open={assignOpen}
        onOpenChange={setAssignOpen}
        reservationId={assignRow?.id ?? null}
        confirmationCode={assignRow?.confirmationCode ?? ""}
        guestName={assignRow?.guestName ?? ""}
        roomTypeCode={assignRow?.roomTypeCode ?? ""}
        currentRoomUnitId={assignRow?.roomUnitId ?? null}
        canOverrideRoom={capabilities.canOverrideRoom}
        onAssigned={() => {
          refresh();
          router.refresh();
        }}
      />

      <FrontDeskReservationCheckInDialog
        slug={slug}
        row={checkInRow}
        open={checkInOpen}
        onOpenChange={setCheckInOpen}
        onSuccess={() => {
          refresh();
          router.refresh();
        }}
        capabilities={capabilities}
        checkInStaffOptions={checkInStaffOptions}
        defaultCheckedInByUserId={defaultCheckedInByUserId}
        currency={currency}
      />
    </div>
  );
}

function ArrivalsSummaryCards({ summary, preset }: { summary: ArrivalSummary; preset: string }) {
  const rangeDetail = preset === "today" ? "Today (UTC)" : "In selected range";
  const cards: { key: string; title: string; value: string; detail: string; accent: keyof typeof FRONT_DESK_ACCENT_BORDER_CLASS }[] = [
    { key: "total", title: "Arrivals", value: String(summary.totalArrivals), detail: rangeDetail, accent: "checkin" },
    { key: "in", title: "Checked in", value: String(summary.checkedIn), detail: "Already on property", accent: "checkin" },
    { key: "pending", title: "Pending", value: String(summary.pending), detail: "Awaiting check-in", accent: "admin" },
    { key: "vip", title: "VIP", value: String(summary.vip), detail: "Priority arrivals", accent: "guest" },
    { key: "noshow", title: "No-shows", value: String(summary.noShows), detail: "Marked no-show", accent: "incidents" },
    { key: "ready", title: "Rooms ready", value: String(summary.roomsReady), detail: "Clean / inspected", accent: "rooms" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <article
          key={c.key}
          className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm ${FRONT_DESK_ACCENT_BORDER_CLASS[c.accent]}`}
        >
          <div
            className={`mb-3 inline-flex h-9 w-9 items-center justify-center rounded-xl ${FRONT_DESK_ACCENT_WELL_CLASS[c.accent]}`}
          >
            <span className="text-lg font-bold text-slate-700">{c.value}</span>
          </div>
          <h3 className="text-sm font-semibold text-slate-900">{c.title}</h3>
          <p className="text-xs text-slate-500">{c.detail}</p>
        </article>
      ))}
    </div>
  );
}
