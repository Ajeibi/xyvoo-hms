"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BedDouble, CalendarClock, CalendarDays, CalendarX, Copy, Plus, Search, SearchX } from "lucide-react";
import { CancelBookingDialog } from "@/components/hms/reservations/CancelBookingDialog";
import {
  HmsCard,
  HmsEmptyState,
  HmsPage,
  HmsPageHeader,
  HmsPill,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { BOOKING_SOURCES } from "@/lib/hms/reservation-create-shared";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { cn } from "@/lib/utils";
import { toastSuccess } from "@/lib/app-toast";
import { FrontDeskCheckInSuccessBanner } from "@/components/hms/frontdesk/FrontDeskCheckInSuccessBanner";
import type {
  ReservationListRow,
  ReservationsListPayload,
  ReservationsListQuery,
} from "@/lib/hms/reservations-list";
import type { ArrivalsRoleCapabilities } from "@/lib/hms/arrivals-rbac";

const SEARCH_DEBOUNCE_MS = 350;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

type StatusFilter = ReservationListRow["status"] | null;
type StatusChip = ReservationListRow["status"] | "all";

const STATUS_LABELS: Record<ReservationListRow["status"], string> = {
  confirmed: "Confirmed",
  checked_in: "Checked in",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const STATUS_TONE: Record<ReservationListRow["status"], "slate" | "green" | "amber" | "red" | "blue"> = {
  confirmed: "blue",
  checked_in: "green",
  checked_out: "slate",
  cancelled: "red",
  no_show: "amber",
};

export function ReservationsListClient({
  slug,
  currency,
  initial,
  query,
  roomTypeOptions,
  capabilities,
}: {
  slug: string;
  currency: string;
  initial: ReservationsListPayload;
  query: ReservationsListQuery;
  roomTypeOptions: Array<{ id: string; name: string }>;
  capabilities: ArrivalsRoleCapabilities;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startNavigation] = useTransition();
  const [search, setSearch] = useState(query.search);
  const statusFilter = query.status;
  const [cancelRow, setCancelRow] = useState<ReservationListRow | null>(null);

  /** Search, status and page live in the URL; the server loads just the matching page. */
  function navigate(next: Partial<ReservationsListQuery>, { replace = false } = {}) {
    const merged = { ...query, ...next };
    const params = new URLSearchParams();
    if (merged.search) params.set("q", merged.search);
    if (merged.status) params.set("status", merged.status);
    if (merged.from) params.set("from", merged.from);
    if (merged.to) params.set("to", merged.to);
    if (merged.source) params.set("source", merged.source);
    if (merged.roomType) params.set("roomType", merged.roomType);
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

  const chipValue: StatusChip = statusFilter ?? "all";
  const chipOptions: Array<{ value: StatusChip; label: string; count?: number | null }> = [
    { value: "all", label: "All", count: initial.summary.total },
    { value: "confirmed", label: "Confirmed", count: initial.summary.confirmed },
    { value: "checked_in", label: "Checked in", count: initial.summary.checkedIn },
    { value: "checked_out", label: "Checked out", count: initial.summary.checkedOut },
    { value: "cancelled", label: "Cancelled" },
    { value: "no_show", label: "No-show" },
  ];

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Reservations"
        meaning="rooms"
        title="Reservations"
        description="Every booking, from guests on their way to guests who have already left."
        actions={
          <>
            <Link href={`/hms/${slug}/reservations/calendar`} className={`${hmsButton.secondary} ${focusRing}`}>
              Calendar
            </Link>
            <Link href={`/hms/${slug}/reservations/allotments`} className={`${hmsButton.secondary} ${focusRing}`}>
              Group allotments
            </Link>
            <Link href={`/hms/${slug}/reservations/new`} className={`${hmsButton.primary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden />
              New reservation
            </Link>
          </>
        }
      />

      <div className="empty:hidden [&>*]:mt-0">
        <Suspense fallback={null}>
          <FrontDeskCheckInSuccessBanner />
        </Suspense>
      </div>

      <HmsSectionIntro
        id="reservations"
        meaning="rooms"
        art="page"
        title="Keep track of every booking"
        points={[
          "Add a booking for a future stay with New reservation. The room is only marked as taken when the guest checks in.",
          "Search by guest name, confirmation code or room, or tap a filter to see one kind of booking.",
          "Open a guest's name to see their stay, their bill and notes about them.",
        ]}
      />

      <HmsStatStrip label="Bookings in figures">
        <HmsStatTile label="All bookings" value={initial.summary.total} icon={CalendarDays} meaning="rooms" hint="Every booking on record" />
        <HmsStatTile label="Coming up" value={initial.summary.confirmed} icon={CalendarClock} meaning="rooms" hint="Confirmed, not yet arrived" />
        <HmsStatTile label="Staying now" value={initial.summary.checkedIn} icon={BedDouble} meaning="guests" hint="Checked in" />
        <HmsStatTile
          label="Cancelled or no-show"
          value={initial.summary.cancelledOrNoShow}
          icon={CalendarX}
          meaning="neutral"
          hint="Bookings that didn't go ahead"
        />
      </HmsStatStrip>

      <div className="space-y-3">
        <div className="max-w-md">
          <label htmlFor="reservations-search" className="mb-1 block text-sm font-medium text-slate-800">
            Search bookings
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              id="reservations-search"
              type="search"
              className={`${hmsInput} pl-10`}
              placeholder="Guest name, confirmation code or room"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <HmsFilterChips
          label="Show bookings that are"
          meaning="rooms"
          options={chipOptions}
          value={chipValue}
          onChange={(v) => setStatusFilter(v === "all" ? null : v)}
        />
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-800">
            Arriving from
            <input type="date" className={`${hmsInput} mt-1`} value={query.from} max={query.to || undefined} onChange={(e) => navigate({ from: e.target.value, page: 1 })} />
          </label>
          <label className="text-sm font-medium text-slate-800">
            Arriving up to
            <input type="date" className={`${hmsInput} mt-1`} value={query.to} min={query.from || undefined} onChange={(e) => navigate({ to: e.target.value, page: 1 })} />
          </label>
          <label className="text-sm font-medium text-slate-800">
            Booked through
            <select className={`${hmsInput} mt-1`} value={query.source} onChange={(e) => navigate({ source: e.target.value, page: 1 })}>
              <option value="">Any</option>
              {BOOKING_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium text-slate-800">
            Room type
            <select className={`${hmsInput} mt-1`} value={query.roomType} onChange={(e) => navigate({ roomType: e.target.value, page: 1 })}>
              <option value="">Any</option>
              {roomTypeOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          {query.from || query.to || query.source || query.roomType ? (
            <button type="button" className={hmsButton.small} onClick={() => navigate({ from: "", to: "", source: "", roomType: "", page: 1 })}>
              Clear these
            </button>
          ) : null}
        </div>
      </div>

      <HmsCard
        id="reservations-list"
        icon={CalendarDays}
        meaning="rooms"
        title="Bookings"
        description={filteredCount > 0 ? `${filteredCount} ${filteredCount === 1 ? "booking" : "bookings"} found.` : undefined}
        flush
      >
        <div className={cn("transition-opacity", isNavigating && "opacity-60")} aria-busy={isNavigating}>
          {filteredCount === 0 ? (
            initial.summary.total === 0 ? (
              <HmsEmptyState
                bare
                art="page"
                meaning="rooms"
                title="No bookings yet"
                description="When you add a booking it will be listed here, ready for the guest's arrival."
                action={
                  <Link href={`/hms/${slug}/reservations/new`} className={`${hmsButton.primary} ${focusRing}`}>
                    Add the first booking
                  </Link>
                }
              />
            ) : (
              <HmsEmptyState
                bare
                icon={SearchX}
                meaning="rooms"
                title="No bookings match"
                description="Try a different search, or show all bookings."
                action={
                  <button
                    type="button"
                    className={`${hmsButton.secondary} ${focusRing}`}
                    onClick={() => {
                      setSearch("");
                      navigate({ search: "", status: null, from: "", to: "", source: "", roomType: "", page: 1 });
                    }}
                  >
                    Show all bookings
                  </button>
                }
              />
            )
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1240px] text-left text-sm">
                <caption className="sr-only">Bookings, {filteredCount} found</caption>
                <thead className="bg-slate-50 text-sm text-slate-700">
                  <tr>
                    <th scope="col" className="min-w-[220px] px-6 py-3 font-semibold">Guest</th>
                    <th scope="col" className="min-w-[120px] px-6 py-3 font-semibold">Room</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Status</th>
                    <th scope="col" className="min-w-[150px] px-6 py-3 font-semibold">Arrival</th>
                    <th scope="col" className="min-w-[150px] px-6 py-3 font-semibold">Departure</th>
                    <th scope="col" className="px-6 py-3 text-center font-semibold">Nights</th>
                    <th scope="col" className="px-6 py-3 text-center font-semibold">Guests</th>
                    <th scope="col" className="min-w-[120px] px-6 py-3 font-semibold">Room charges</th>
                    <th scope="col" className="px-6 py-3 font-semibold">Booked through</th>
                    <th scope="col" className="min-w-[160px] px-6 py-3 font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-6 py-3">
                        <Link
                          href={`/hms/${slug}/reservations/${row.id}`}
                          className={`rounded font-medium text-slate-900 hover:text-blue-700 hover:underline ${focusRing}`}
                        >
                          {row.guestName}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2">
                          <button
                            type="button"
                            className={`inline-flex items-center gap-1 rounded text-xs text-slate-600 hover:text-slate-900 hover:underline ${focusRing}`}
                            onClick={() => {
                              void navigator.clipboard.writeText(row.confirmationCode);
                              toastSuccess("Confirmation code copied");
                            }}
                            aria-label={`Copy confirmation code ${row.confirmationCode}`}
                            title="Copy confirmation code"
                          >
                            {row.confirmationCode}
                            <Copy className="h-3 w-3" aria-hidden />
                          </button>
                          {row.vipFlag ? <HmsPill tone="amber">VIP</HmsPill> : null}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-slate-800">
                        {row.roomCode ?? "Not assigned"}
                        <p className="text-xs text-slate-600">{row.roomTypeName}</p>
                      </td>
                      <td className="px-6 py-3">
                        <HmsPill tone={STATUS_TONE[row.status]}>{STATUS_LABELS[row.status]}</HmsPill>
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 text-slate-700">{formatBoardDateTime(row.arrivalAt)}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-slate-700">{formatBoardDateTime(row.departureAt)}</td>
                      <td className="px-6 py-3 text-center tabular-nums text-slate-700">{row.nights}</td>
                      <td className="px-6 py-3 text-center tabular-nums text-slate-700">{row.partySize}</td>
                      <td className="whitespace-nowrap px-6 py-3 tabular-nums text-slate-800">
                        {formatPricingAmount(row.totalRoomCharges, currency)}
                      </td>
                      <td className="whitespace-nowrap px-6 py-3 capitalize text-slate-700">{row.source.replace(/_/g, " ")}</td>
                      <td className="whitespace-nowrap px-6 py-3">
                        {row.status === "confirmed" ? (
                          <div className="flex items-center gap-2">
                            {capabilities.canCheckIn ? (
                              <Link
                                href={`/hms/${slug}/reservations/${row.id}/check-in`}
                                className={`${hmsButton.primary} px-3 py-1.5 ${focusRing}`}
                                aria-label={`Check in ${row.guestName}`}
                              >
                                Check in
                              </Link>
                            ) : null}
                            <button
                              type="button"
                              className={`${hmsButton.danger} ${focusRing}`}
                              aria-label={`Cancel booking for ${row.guestName}`}
                              onClick={() => setCancelRow(row)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-600">
                            <span aria-hidden>—</span>
                            <span className="sr-only">No actions</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </HmsCard>

      {filteredCount > 0 ? (
        <nav aria-label="Pages of bookings" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
          <p>
            Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, filteredCount)} of {filteredCount}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
              disabled={currentPage <= 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              Previous
            </button>
            <span className="px-2 text-sm font-medium text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}

      {cancelRow ? (
        <CancelBookingDialog
          slug={slug}
          reservationId={cancelRow.id}
          guestName={cancelRow.guestName}
          currency={currency}
          open
          onClose={() => setCancelRow(null)}
          onDone={() => {
            setCancelRow(null);
            router.refresh();
          }}
        />
      ) : null}
    </HmsPage>
  );
}
