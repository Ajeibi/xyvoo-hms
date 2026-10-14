"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BedDouble,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DoorOpen,
  ListFilter,
  RefreshCw,
  Search,
  Star,
  UserX,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  HmsCard,
  HmsEmptyState,
  HmsPageHeader,
  HmsPill,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
} from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
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
import { StaleDataNotice } from "@/components/hms/StaleDataNotice";

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  confirmed: "blue",
  checked_in: "green",
  checked_out: "slate",
  cancelled: "slate",
  no_show: "red",
};

const DATE_PRESETS = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "week", label: "This week" },
  { value: "custom", label: "Choose dates" },
];

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

const TH = "px-4 py-3 text-left text-sm font-semibold text-slate-700";
const TD = "px-4 py-4 align-middle text-sm text-slate-700";
const SORT_BUTTON =
  "inline-flex cursor-pointer items-center gap-1 rounded hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

const FILTER_LABEL = "mb-1 block text-sm font-medium text-slate-800";
const FILTER_SELECT =
  "h-11 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition-colors focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-blue-500";
const FILTER_INPUT = "h-11 rounded-xl border-slate-300 bg-white";

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

/** A visible label over a filter. `htmlFor` for real inputs; popover pickers use the label's id instead. */
function FilterField({
  id,
  label,
  children,
  className,
}: {
  id: string;
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label id={`${id}-label`} htmlFor={id} className={FILTER_LABEL}>
        {label}
      </label>
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
  // Set when a refresh fails: when the list on screen was last loaded successfully.
  const [lastGoodAt, setLastGoodAt] = useState(() => new Date());
  const [refreshFailed, setRefreshFailed] = useState(false);
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
      const json = await res.json().catch(() => null);
      if (res.ok && json && !json.error) {
        setData(json);
        setPage(1);
        setLastGoodAt(new Date());
        setRefreshFailed(false);
      } else {
        setRefreshFailed(true);
      }
    } catch {
      setRefreshFailed(true);
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
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="rooms"
        title="Arrivals and check-in"
        description={`${data.rangeLabel}: see who is due, give them a room and check them in.`}
        actions={
          <button type="button" className={hmsButton.secondary} onClick={() => refresh()} disabled={loading}>
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} aria-hidden />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        }
      />

      <HmsSectionIntro
        id="frontdesk-arrivals"
        meaning="rooms"
        art="people"
        title="What you can do here"
        points={[
          "See everyone due to arrive today, tomorrow or this week, and who has already checked in.",
          "Give each guest a room before they arrive, so check-in at the desk is quick.",
          "Open a guest to see their booking and balance, then check them in.",
        ]}
      />

      {refreshFailed ? (
        <StaleDataNotice what="arrivals" since={lastGoodAt} onRetry={() => refresh()} retrying={loading} />
      ) : null}

      <ArrivalsSummaryCards summary={data.summary} preset={preset} />

      <HmsCard
        id="arrivals-filters"
        icon={ListFilter}
        meaning="rooms"
        title="Find an arrival"
        description="Choose the dates, then narrow the list down."
        flush
      >
        <div className="space-y-6 p-5 sm:p-6">
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Arriving</h3>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <HmsFilterChips
                label="Arrival dates"
                meaning="rooms"
                options={DATE_PRESETS}
                value={preset}
                onChange={setPreset}
              />
              {preset === "custom" ? (
                <div className="flex flex-wrap gap-4">
                  <FilterField id="arrivals-from" label="From" className="min-w-[160px]">
                    <Input
                      id="arrivals-from"
                      type="date"
                      className={FILTER_INPUT}
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                    />
                  </FilterField>
                  <FilterField id="arrivals-to" label="To" className="min-w-[160px]">
                    <Input
                      id="arrivals-to"
                      type="date"
                      className={FILTER_INPUT}
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                    />
                  </FilterField>
                </div>
              ) : (
                <p className="text-sm text-slate-600 lg:pb-2">{data.rangeLabel}</p>
              )}
            </div>
          </div>

          <Separator className="bg-slate-200" />

          <FilterField id="arrivals-search" label="Search arrivals">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <Input
                id="arrivals-search"
                type="search"
                placeholder="Name, booking reference, phone, email or room"
                className={cn(FILTER_INPUT, "pl-10 text-base md:text-sm")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </FilterField>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Narrow the list</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <FilterField id="arrivals-status" label="Status">
                <FrontDeskPopoverSelect
                  id="arrivals-status"
                  aria-labelledby="arrivals-status-label"
                  value={statusFilter}
                  onChange={setStatusFilter}
                  placeholder="All statuses"
                  options={ARRIVAL_STATUS_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField id="arrivals-payment" label="Payment">
                <FrontDeskPopoverSelect
                  id="arrivals-payment"
                  aria-labelledby="arrivals-payment-label"
                  value={paymentFilter}
                  onChange={setPaymentFilter}
                  placeholder="All payments"
                  options={ARRIVAL_PAYMENT_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField id="arrivals-source" label="Booked through">
                <FrontDeskPopoverSelect
                  id="arrivals-source"
                  aria-labelledby="arrivals-source-label"
                  value={sourceFilter}
                  onChange={setSourceFilter}
                  placeholder="All sources"
                  options={ARRIVAL_SOURCE_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField id="arrivals-readiness" label="Room ready?">
                <FrontDeskPopoverSelect
                  id="arrivals-readiness"
                  aria-labelledby="arrivals-readiness-label"
                  value={readinessFilter}
                  onChange={setReadinessFilter}
                  placeholder="Any readiness"
                  options={ARRIVAL_READINESS_FILTER_OPTIONS}
                />
              </FilterField>
              <FilterField id="arrivals-vip" label="Guest type">
                <button
                  id="arrivals-vip"
                  type="button"
                  aria-pressed={vipOnly}
                  onClick={() => setVipOnly((v) => !v)}
                  className={cn(
                    FILTER_SELECT,
                    "flex items-center justify-center gap-2 font-medium transition-colors",
                    vipOnly
                      ? "border-amber-600 bg-amber-50 text-amber-900"
                      : "text-slate-700 hover:bg-slate-50",
                  )}
                >
                  <Star className="h-4 w-4" aria-hidden />
                  {vipOnly ? "VIP guests only: on" : "VIP guests only: off"}
                </button>
              </FilterField>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3.5 sm:px-6">
          <p className="text-sm text-slate-600">
            Select a row to see the guest&apos;s full details. Late arrivals have a red edge and a{" "}
            <span className="font-medium text-red-700">Delayed</span> label.
          </p>
          {hasActiveFilters ? (
            <button type="button" className={hmsButton.quiet} onClick={clearFilters}>
              Clear all filters
            </button>
          ) : null}
        </div>
        <div className="border-t border-slate-100 px-5 py-3 sm:px-6">
          <PaymentLegend />
          <p className="mt-1 text-xs text-slate-600">The dot sits next to each guest&apos;s balance.</p>
        </div>
      </HmsCard>

      {capabilities.canBulkActions && selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-sky-50 px-4 py-3">
          <p className="text-sm font-medium text-sky-950" role="status">
            {selectedIds.size} reservation{selectedIds.size === 1 ? "" : "s"} selected
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={hmsButton.secondary} onClick={() => bulkExport()}>
              Copy booking references
            </button>
            <button type="button" className={hmsButton.secondary} onClick={() => bulkReopen()}>
              Reopen selected
            </button>
            <button type="button" className={hmsButton.quiet} onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </button>
          </div>
        </div>
      ) : null}

      <HmsCard
        id="arrivals-list"
        icon={DoorOpen}
        meaning="rooms"
        title="Arrivals"
        description={`${sortedRows.length} ${sortedRows.length === 1 ? "booking" : "bookings"} · ${data.rangeLabel}`}
        flush
      >
      <div className="thin-scrollbar relative" aria-busy={loading}>
        {loading ? (
          <div
            className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-white/70 backdrop-blur-[1px]"
            aria-hidden
          >
            <RefreshCw className="h-7 w-7 animate-spin text-sky-700" />
          </div>
        ) : null}
        {sortedRows.length === 0 && !loading ? (
          <HmsEmptyState
            bare
            art="people"
            meaning="rooms"
            title="No arrivals in this view"
            description={
              hasActiveFilters
                ? "Try clearing the filters or choosing a wider range of dates."
                : "No one is booked to arrive in these dates."
            }
            action={
              hasActiveFilters ? (
                <button type="button" className={hmsButton.secondary} onClick={clearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
        <div className="overflow-x-auto pb-0.5">
        <table className="min-w-[1900px] w-full border-collapse text-left">
          <caption className="sr-only">Arrivals, {data.rangeLabel}</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
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
              <th
                className={cn(TH, "min-w-[120px]")}
                aria-sort={sortKey === "confirmationCode" ? (sortAsc ? "ascending" : "descending") : undefined}
              >
                <button type="button" className={SORT_BUTTON} onClick={() => toggleSort("confirmationCode")}>
                  Reference
                </button>
              </th>
              <th className={cn(TH, "min-w-[100px]")}>Booked</th>
              <th
                className={cn(TH, "min-w-[260px]")}
                aria-sort={sortKey === "guestName" ? (sortAsc ? "ascending" : "descending") : undefined}
              >
                <button type="button" className={SORT_BUTTON} onClick={() => toggleSort("guestName")}>
                  Guest
                </button>
              </th>
              <th className={cn(TH, "min-w-[240px]")}>Contact</th>
              <th
                className={cn(TH, "min-w-[160px]")}
                aria-sort={sortKey === "arrivalAt" ? (sortAsc ? "ascending" : "descending") : undefined}
              >
                <button type="button" className={SORT_BUTTON} onClick={() => toggleSort("arrivalAt")}>
                  Arrival
                </button>
              </th>
              <th className={cn(TH, "min-w-[110px]")}>Departure</th>
              <th className={cn(TH, "min-w-[72px] text-center")}>Nights</th>
              <th className={cn(TH, "min-w-[180px]")}>Room type and floor</th>
              <th className={cn(TH, "min-w-[90px]")}>Room</th>
              <th className={cn(TH, "min-w-[64px] text-center")}>Guests</th>
              <th className={cn(TH, "min-w-[100px] text-right")}>Total</th>
              <th className={cn(TH, "min-w-[100px] text-right")}>Paid</th>
              <th className={cn(TH, "min-w-[120px] text-right")}>Balance</th>
              <th className={cn(TH, "min-w-[100px]")}>Status</th>
              <th className={cn(TH, "min-w-[100px]")}>Room cleaning</th>
              <th className={cn(TH, "min-w-[100px]")}>Progress</th>
              <th className={cn(TH, "min-w-[88px]")}>Requests</th>
              <th className={cn(TH, "sticky right-0 z-10 min-w-[168px] bg-slate-50/95 backdrop-blur-sm text-right")}>
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
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                              <Star className="h-3 w-3" aria-hidden />
                              VIP
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-slate-600">{row.bookingSourceLabel}</p>
                      </div>
                    </td>
                    <td className={cn(TD, "whitespace-nowrap text-xs leading-relaxed text-slate-600", surface)}>
                      <div>{row.phone}</div>
                      <div className="text-slate-600">{row.email}</div>
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
                      {row.floor != null ? <div className="text-slate-600">Floor {row.floor}</div> : null}
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
                          aria-hidden
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${PAYMENT_DOT_CLASS[row.paymentStatus]}`}
                          title={PAYMENT_STATUS_LABEL[row.paymentStatus]}
                        />
                        <span className="sr-only">{PAYMENT_STATUS_LABEL[row.paymentStatus]}: </span>
                        {formatPricingAmount(row.outstandingBalance, currency)}
                      </span>
                    </td>
                    <td className={cn(TD, "text-xs", surface)}>
                      <HmsPill tone={STATUS_TONE[row.status] ?? "slate"}>{STATUS_LABEL[row.status] ?? row.status}</HmsPill>
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
                        <span className="text-slate-500">
                          <span aria-hidden>—</span>
                          <span className="sr-only">None</span>
                        </span>
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
        <nav
          aria-label="Arrivals pages"
          className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-700 sm:px-6"
        >
          <p>
            Showing {(currentPage - 1) * ARRIVALS_PAGE_SIZE + 1}–
            {Math.min(currentPage * ARRIVALS_PAGE_SIZE, sortedRows.length)} of {sortedRows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={currentPage <= 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              Previous
            </Button>
            <span className="px-2 text-sm font-medium text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </Button>
          </div>
        </nav>
      ) : null}
      </HmsCard>

      <section aria-labelledby="arrivals-timeline-toggle">
        <button
          id="arrivals-timeline-toggle"
          type="button"
          aria-expanded={showTimeline}
          aria-controls="arrivals-timeline"
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg font-heading text-base font-semibold text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          onClick={() => setShowTimeline(!showTimeline)}
        >
          {showTimeline ? (
            <ChevronDown className="h-4 w-4 text-sky-700" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4 text-sky-700" aria-hidden />
          )}
          Arrivals through the day
        </button>
        {showTimeline ? (
          <div id="arrivals-timeline" className="mt-4">
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
  const rangeDetail = preset === "today" ? "Due today (UTC)" : "In the dates you chose";
  return (
    <HmsStatStrip label="Arrivals at a glance" columns={3}>
      <HmsStatTile label="Arrivals" value={summary.totalArrivals} hint={rangeDetail} icon={DoorOpen} meaning="rooms" />
      <HmsStatTile label="Checked in" value={summary.checkedIn} hint="Already in the hotel" icon={CheckCircle2} meaning="rooms" />
      <HmsStatTile
        label="Still to check in"
        value={summary.pending}
        hint="No one waiting"
        icon={Clock}
        meaning="guests"
        status={summary.pending > 0 ? "warning" : undefined}
        statusText={summary.pending > 0 ? "Waiting to check in" : undefined}
      />
      <HmsStatTile label="VIP guests" value={summary.vip} hint="Guests to look after first" icon={Star} meaning="guests" />
      <HmsStatTile
        label="No-shows"
        value={summary.noShows}
        hint="None marked"
        icon={UserX}
        meaning="attention"
        status={summary.noShows > 0 ? "critical" : undefined}
        statusText={summary.noShows > 0 ? "Marked as no-show" : undefined}
      />
      <HmsStatTile label="Rooms ready" value={summary.roomsReady} hint="Clean or inspected" icon={BedDouble} meaning="rooms" />
    </HmsStatStrip>
  );
}
