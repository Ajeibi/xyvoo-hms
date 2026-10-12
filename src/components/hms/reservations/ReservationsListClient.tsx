"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { FrontDeskCheckInSuccessBanner } from "@/components/hms/frontdesk/FrontDeskCheckInSuccessBanner";
import type {
  ReservationListRow,
  ReservationsListPayload,
  ReservationsListQuery,
} from "@/lib/hms/reservations-list";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";

const SEARCH_DEBOUNCE_MS = 350;

type StatusFilter = ReservationListRow["status"] | null;

const STATUS_LABELS: Record<ReservationListRow["status"], string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

function SummaryCard({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition-colors",
        active ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50",
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
    </button>
  );
}

function statusBadgeClass(status: ReservationListRow["status"]) {
  switch (status) {
    case "checked_in":
      return "bg-blue-50 text-blue-800";
    case "checked_out":
      return "bg-emerald-100 text-emerald-900";
    case "cancelled":
    case "no_show":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-amber-50 text-amber-900";
  }
}

export function ReservationsListClient({
  slug,
  currency,
  initial,
  query,
  capabilities,
}: {
  slug: string;
  currency: string;
  initial: ReservationsListPayload;
  query: ReservationsListQuery;
  capabilities: ArrivalsRoleCapabilities;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(query.search);
  const statusFilter = query.status;
  const [cancelRow, setCancelRow] = useState<ReservationListRow | null>(null);
  const [cancelling, setCancelling] = useState(false);

  async function confirmCancel() {
    if (!cancelRow) return;
    setCancelling(true);
    try {
      const res = await fetch(`/api/hotel/frontdesk/reservations/${cancelRow.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not cancel reservation", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Reservation cancelled", cancelRow.confirmationCode);
      setCancelRow(null);
      router.refresh();
    } finally {
      setCancelling(false);
    }
  }

  /** Search, status and page live in the URL; the server loads just the matching page. */
  function navigate(next: Partial<ReservationsListQuery>, { replace = false } = {}) {
    const merged = { ...query, ...next };
    const params = new URLSearchParams();
    if (merged.search) params.set("q", merged.search);
    if (merged.status) params.set("status", merged.status);
    if (merged.page > 1) params.set("page", String(merged.page));
    const qs = params.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    startNavigation(() => {
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    });
  }

  function setStatusFilter(update: StatusFilter | ((current: StatusFilter) => StatusFilter)) {
    const status = typeof update === "function" ? update(statusFilter) : update;
    navigate({ status, page: 1 });
  }

  function setPage(page: number) {
    navigate({ page });
  }

  useEffect(() => {
    const trimmed = search.trim();
    if (trimmed === query.search) return;
    const timer = setTimeout(() => navigate({ search: trimmed, page: 1 }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // navigate is recreated every render; only a change to the typed search should restart the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, query.search]);

  const pageSize = initial.pageSize;
  const filteredCount = initial.filteredTotal;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const currentPage = initial.page;
  const pageRows = initial.rows;

  return (
    <div className="px-8 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Reservations</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage upcoming and in-house stays</p>
        </div>
        <Link
          href={`/hms/${slug}/reservations/new`}
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New reservation
        </Link>
      </div>

      <Suspense fallback={null}>
        <FrontDeskCheckInSuccessBanner />
      </Suspense>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          label="Total"
          value={initial.summary.total}
          active={!statusFilter}
          onClick={() => {
            setStatusFilter(null);
          }}
        />
        <SummaryCard
          label="Confirmed"
          value={initial.summary.confirmed}
          active={statusFilter === "confirmed"}
          onClick={() => {
            setStatusFilter((s) => (s === "confirmed" ? null : "confirmed"));
          }}
        />
        <SummaryCard
          label="Checked in"
          value={initial.summary.checkedIn}
          active={statusFilter === "checked_in"}
          onClick={() => {
            setStatusFilter((s) => (s === "checked_in" ? null : "checked_in"));
          }}
        />
        <SummaryCard
          label="Checked out"
          value={initial.summary.checkedOut}
          active={statusFilter === "checked_out"}
          onClick={() => {
            setStatusFilter((s) => (s === "checked_out" ? null : "checked_out"));
          }}
        />
        <SummaryCard
          label="Cancelled / no-show"
          value={initial.summary.cancelledOrNoShow}
          active={statusFilter === "cancelled" || statusFilter === "no_show"}
          onClick={() => {
            setStatusFilter((s) => (s === "cancelled" ? "no_show" : s === "no_show" ? null : "cancelled"));
          }}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Search</p>
          <Input
            className="max-w-xs"
            placeholder="Guest, confirmation code, room…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Status</p>
          <select
            className="h-10 rounded-lg border border-input bg-white px-3 text-sm"
            value={statusFilter ?? ""}
            onChange={(e) => setStatusFilter((e.target.value || null) as StatusFilter)}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked in</option>
            <option value="checked_out">Checked out</option>
            <option value="cancelled">Cancelled</option>
            <option value="no_show">No-show</option>
          </select>
        </div>
      </div>

      <div
        className={cn(
          "mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white transition-opacity",
          isNavigating && "opacity-60",
        )}
        aria-busy={isNavigating}
      >
        {filteredCount === 0 ? (
          <p className="p-16 text-center text-sm text-slate-500">
            {initial.summary.total === 0 ? "No reservations yet." : "No reservations match your filters."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="min-w-[220px] px-6 py-3">Guest</th>
                  <th className="min-w-[120px] px-6 py-3">Room</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="min-w-[150px] px-6 py-3">Arrival</th>
                  <th className="min-w-[150px] px-6 py-3">Departure</th>
                  <th className="px-6 py-3 text-center">Nights</th>
                  <th className="px-6 py-3 text-center">Party</th>
                  <th className="min-w-[120px] px-6 py-3">Total</th>
                  <th className="px-6 py-3">Source</th>
                  <th className="min-w-[160px] px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                    <td className="whitespace-nowrap px-6 py-3">
                      <Link
                        href={`/hms/${slug}/reservations/${row.id}`}
                        className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                      >
                        {row.guestName}
                      </Link>
                      <button
                        type="button"
                        className="block text-xs text-slate-500 hover:text-slate-700 hover:underline"
                        onClick={() => {
                          void navigator.clipboard.writeText(row.confirmationCode);
                          toastSuccess("Confirmation code copied");
                        }}
                        title="Copy confirmation code"
                      >
                        {row.confirmationCode}
                        {row.vipFlag ? (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900">
                            VIP
                          </span>
                        ) : null}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">
                      {row.roomCode ?? "Unassigned"}
                      <p className="text-xs text-slate-400">{row.roomTypeName}</p>
                    </td>
                    <td className="px-6 py-3">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", statusBadgeClass(row.status))}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{formatBoardDateTime(row.arrivalAt)}</td>
                    <td className="whitespace-nowrap px-6 py-3 text-slate-600">{formatBoardDateTime(row.departureAt)}</td>
                    <td className="px-6 py-3 text-center tabular-nums text-slate-700">{row.nights}</td>
                    <td className="px-6 py-3 text-center tabular-nums text-slate-700">{row.partySize}</td>
                    <td className="whitespace-nowrap px-6 py-3 tabular-nums text-slate-700">
                      {formatPricingAmount(row.totalRoomCharges, currency)}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3 capitalize text-slate-600">
                      {row.source.replace(/_/g, " ")}
                    </td>
                    <td className="whitespace-nowrap px-6 py-3">
                      {row.status === "confirmed" ? (
                        <div className="flex items-center gap-2">
                          {capabilities.canCheckIn ? (
                            <Button type="button" size="sm" asChild>
                              <Link href={`/hms/${slug}/reservations/${row.id}/check-in`}>Check in</Link>
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="text-red-700 hover:bg-red-50"
                            onClick={() => setCancelRow(row)}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, filteredCount)} of {filteredCount}
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

      <Dialog open={Boolean(cancelRow)} onOpenChange={(open) => !open && setCancelRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cancel reservation?</DialogTitle>
            <DialogDescription>
              {cancelRow?.guestName} · {cancelRow?.confirmationCode}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            This releases the room hold (if any) and marks the reservation cancelled. This can&apos;t be undone.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCancelRow(null)} disabled={cancelling}>
              Keep reservation
            </Button>
            <Button
              type="button"
              className="bg-red-600 hover:bg-red-700"
              onClick={() => void confirmCancel()}
              disabled={cancelling}
            >
              {cancelling ? "Cancelling…" : "Cancel reservation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
