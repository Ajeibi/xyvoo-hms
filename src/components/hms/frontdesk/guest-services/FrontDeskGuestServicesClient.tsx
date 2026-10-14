"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheck, Clock, ConciergeBell, Hourglass, Plus, Receipt, RefreshCw, Search, Siren } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";
import { Skeleton } from "@/components/ui/skeleton";
import type { GuestServicesListPayload, GuestRequestRow, InHouseGuestOption } from "@/lib/hms/guest-services";
import { GUEST_REQUEST_DEPARTMENTS, GUEST_REQUEST_DEPARTMENT_LABELS } from "@/lib/hms/guest-services";
import type { GuestServicesRoleCapabilities } from "@/lib/hms/guest-services-rbac";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import { FrontDeskGuestServiceDetailSheet } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServiceDetailSheet";
import { FrontDeskGuestServicesAnalytics } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServicesAnalytics";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GUEST_SERVICES_PAGE_SIZE = 5;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

/** A figure tile on the guests tint. With onClick it also filters the list; pressed shows which filter is on. */
function SummaryCard({
  label,
  value,
  subtitle,
  icon: Icon,
  meaning = "guests",
  active: isActive,
  onClick,
}: {
  label: string;
  value: number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  meaning?: HmsMeaning;
  active?: boolean;
  onClick?: () => void;
}) {
  const tone = HMS_MEANING[meaning];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${tone.iconBox}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-0.5 font-heading text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {subtitle ? <p className="mt-1 text-xs leading-5 text-slate-600">{subtitle}</p> : null}
    </>
  );
  if (!onClick) return <div className={`rounded-2xl p-4 ${tone.tint}`}>{body}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={Boolean(isActive)}
      className={cn(
        "rounded-2xl p-4 text-left transition-shadow hover:shadow-md",
        tone.tint,
        focusRing,
        isActive && "ring-2 ring-slate-800",
      )}
    >
      {body}
    </button>
  );
}

export function FrontDeskGuestServicesClient({
  slug,
  tenantId,
  capabilities,
  initialSearch = "",
}: {
  slug: string;
  tenantId: string;
  capabilities: GuestServicesRoleCapabilities;
  /** Deep link from guest profile etc. */
  initialSearch?: string;
}) {
  const [data, setData] = useState<GuestServicesListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<{
    status?: string;
    priority?: string;
    department?: string;
    vipOnly?: boolean;
    delayed?: boolean;
    billable?: boolean;
    dateFrom?: string;
    dateTo?: string;
  }>({});
  const [search, setSearch] = useState(initialSearch);
  const [debouncedQ, setDebouncedQ] = useState(initialSearch.trim());

  useEffect(() => {
    setSearch(initialSearch);
    setDebouncedQ(initialSearch.trim());
  }, [initialSearch]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    reservationId: "",
    department: "",
    requestType: "",
    details: "",
    priority: "normal" as const,
    billable: false,
  });
  const [inHouseGuests, setInHouseGuests] = useState<InHouseGuestOption[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(false);

  useEffect(() => {
    if (!createOpen || !tenantId) return;
    let cancelled = false;
    setGuestsLoading(true);
    fetch(`/api/hotel/frontdesk/guest-services/in-house?${new URLSearchParams({ slug })}`)
      .then((res) => res.json())
      .then((json: { guests?: InHouseGuestOption[]; error?: string }) => {
        if (!cancelled && !json.error) setInHouseGuests(json.guests ?? []);
      })
      .finally(() => {
        if (!cancelled) setGuestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [createOpen, slug, tenantId]);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (filter.status) params.set("status", filter.status);
      if (filter.priority) params.set("priority", filter.priority);
      if (filter.department) params.set("department", filter.department);
      if (filter.vipOnly) params.set("vipOnly", "true");
      if (debouncedQ) params.set("q", debouncedQ);
      if (filter.dateFrom) params.set("dateFrom", `${filter.dateFrom}T00:00:00.000Z`);
      if (filter.dateTo) params.set("dateTo", `${filter.dateTo}T23:59:59.999Z`);
      const res = await fetch(`/api/hotel/frontdesk/guest-services?${params}`);
      const json = (await res.json()) as GuestServicesListPayload & { error?: string };
      if (!json.error) {
        setData(json);
        setPage(1);
      }
    } finally {
      setLoading(false);
    }
  }, [
    slug,
    tenantId,
    filter.status,
    filter.priority,
    filter.department,
    filter.vipOnly,
    filter.dateFrom,
    filter.dateTo,
    debouncedQ,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useFrontDeskRealtime(tenantId, Boolean(tenantId), refresh);

  const filteredRows = useMemo(() => {
    const rows = data?.requests ?? [];
    return rows.filter((r) => {
      if (filter.delayed) {
        if (
          !r.expectedCompletedAt ||
          ["completed", "cancelled"].includes(r.status) ||
          new Date(r.expectedCompletedAt).getTime() >= Date.now()
        ) {
          return false;
        }
      }
      if (filter.billable) {
        if (!r.billable || r.folioLineId || ["completed", "cancelled"].includes(r.status)) return false;
      }
      return true;
    });
  }, [data?.requests, filter.delayed, filter.billable]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / GUEST_SERVICES_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * GUEST_SERVICES_PAGE_SIZE, currentPage * GUEST_SERVICES_PAGE_SIZE),
    [filteredRows, currentPage],
  );

  async function submitCreate() {
    if (!capabilities.canCreate || !createForm.department) return;
    const res = await fetch(`/api/hotel/frontdesk/guest-services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId: createForm.reservationId,
        department: createForm.department,
        serviceCategory: createForm.requestType.trim(),
        requestType: createForm.requestType.trim(),
        details: createForm.details.trim() || undefined,
        priority: createForm.priority,
        billable: createForm.billable,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not create request", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Guest service request created");
    setCreateOpen(false);
    setCreateForm({
      reservationId: "",
      department: "",
      requestType: "",
      details: "",
      priority: "normal",
      billable: false,
    });
    void refresh();
  }

  const summary = data?.summary;

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Guest services"
        description="Log what guests ask for, send it to the right team, keep an eye on how long it takes, and add any cost to their bill."
        actions={
          <>
            <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => void refresh()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden />
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            {capabilities.canCreate ? (
              <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                New request
              </button>
            ) : null}
          </>
        }
      />

      <FrontDeskGuestServicesAnalytics slug={slug} />

      {summary ? (
        <section aria-label="Requests in figures. Select a figure to filter the list." className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <SummaryCard
            label="Active"
            icon={ConciergeBell}
            value={summary.active}
            subtitle="Show all"
            active={!filter.status && !filter.delayed && !filter.billable}
            onClick={() => setFilter({})}
          />
          <SummaryCard
            label="Waiting to start"
            icon={Hourglass}
            value={summary.pending}
            active={filter.status === "pending"}
            onClick={() => setFilter((f) => ({ ...f, status: f.status === "pending" ? undefined : "pending" }))}
          />
          <SummaryCard label="Done today" icon={CircleCheck} value={summary.completedToday} />
          <SummaryCard
            label="Urgent or VIP"
            icon={Siren}
            meaning="attention"
            value={summary.urgent}
            subtitle={`Urgent ${summary.urgentPriority} · VIP ${summary.vipLine}`}
            active={filter.priority === "urgent" || filter.priority === "vip"}
            onClick={() =>
              setFilter((f) => {
                if (f.priority === "urgent") return { ...f, priority: "vip" };
                if (f.priority === "vip") return { ...f, priority: undefined };
                return { ...f, priority: "urgent" };
              })
            }
          />
          <SummaryCard
            label="Running late"
            icon={Clock}
            meaning="attention"
            value={summary.delayed}
            active={filter.delayed}
            onClick={() => {
              setFilter((f) => ({ ...f, delayed: !f.delayed, status: undefined }));
              setPage(1);
            }}
          />
          <SummaryCard
            label="Not yet billed"
            icon={Receipt}
            meaning="money"
            value={summary.billablePending}
            active={filter.billable}
            onClick={() => {
              setFilter((f) => ({ ...f, billable: !f.billable }));
              setPage(1);
            }}
          />
        </section>
      ) : null}

      <section aria-label="Filter requests" className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="gs-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                id="gs-search"
                type="search"
                className={`${hmsInput} pl-10`}
                placeholder="Guest, room or request number"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <HmsField id="gs-from" label="Made on or after">
            <input
              id="gs-from"
              type="date"
              className={hmsInput}
              value={filter.dateFrom ?? ""}
              onChange={(e) => setFilter((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
            />
          </HmsField>
          <HmsField id="gs-to" label="Made on or before">
            <input
              id="gs-to"
              type="date"
              className={hmsInput}
              value={filter.dateTo ?? ""}
              onChange={(e) => setFilter((f) => ({ ...f, dateTo: e.target.value || undefined }))}
            />
          </HmsField>
          <HmsField id="gs-department" label="Team">
            <select
              id="gs-department"
              className={hmsInput}
              value={filter.department ?? ""}
              onChange={(e) => setFilter((f) => ({ ...f, department: e.target.value || undefined }))}
            >
              <option value="">All teams</option>
              {GUEST_REQUEST_DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {GUEST_REQUEST_DEPARTMENT_LABELS[d]}
                </option>
              ))}
            </select>
          </HmsField>
        </div>
        <label className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-slate-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-400 accent-amber-700"
            checked={filter.vipOnly ?? false}
            onChange={(e) => setFilter((f) => ({ ...f, vipOnly: e.target.checked || undefined }))}
          />
          VIP guests only
        </label>
      </section>

      {loading && !data ? (
        <GuestServicesTableSkeleton />
      ) : (
        <HmsCard
          id="guest-requests"
          icon={ConciergeBell}
          meaning="guests"
          title="Requests"
          description={filteredRows.length > 0 ? "Select View to see a request, update it or add its cost to the bill." : undefined}
          flush
        >
         <div className="relative" aria-busy={loading}>
          {loading ? (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <RefreshCw className="h-8 w-8 animate-spin text-slate-600 motion-reduce:animate-none" aria-hidden />
              <span className="sr-only">Refreshing</span>
            </div>
          ) : null}
          {filteredRows.length === 0 ? (
            <HmsEmptyState
              bare
              art="bell"
              meaning="guests"
              title="No requests to show"
              description="Nothing matches these filters. Requests guests make, such as extra towels or room service, will appear here."
              action={
                capabilities.canCreate ? (
                  <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setCreateOpen(true)}>
                    Log a request
                  </button>
                ) : undefined
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1320px] text-left text-sm">
                <caption className="sr-only">Guest requests</caption>
                <thead className="bg-slate-50 text-sm text-slate-700">
                  <tr>
                    <th scope="col" className="min-w-[220px] px-4 py-3 font-semibold">Guest and room</th>
                    <th scope="col" className="min-w-[130px] px-4 py-3 font-semibold">Phone</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Request number</th>
                    <th scope="col" className="min-w-[140px] px-4 py-3 font-semibold">Made</th>
                    <th scope="col" className="min-w-[140px] px-4 py-3 font-semibold">Assigned to</th>
                    <th scope="col" className="min-w-[180px] px-4 py-3 font-semibold">Request</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Team</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Priority</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="min-w-[140px] px-4 py-3 font-semibold">Due by</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Billing</th>
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <GuestServiceTableRow
                      key={row.id}
                      row={row}
                      onOpen={() => {
                        setSelectedId(row.id);
                        setSheetOpen(true);
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
         </div>
        </HmsCard>
      )}

      {filteredRows.length > 0 ? (
        <nav aria-label="Pages of requests" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
          <p>
            Showing {(currentPage - 1) * GUEST_SERVICES_PAGE_SIZE + 1} to{" "}
            {Math.min(currentPage * GUEST_SERVICES_PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
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

      <FrontDeskGuestServiceDetailSheet
        slug={slug}
        requestId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        capabilities={capabilities}
        onUpdated={() => void refresh()}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New guest request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="gs-new-guest" className="mb-1 block text-sm font-medium text-slate-800">
                Guest and room
              </label>
              <select
                id="gs-new-guest"
                className={hmsInput}
                aria-describedby={!guestsLoading && inHouseGuests.length === 0 ? "gs-new-guest-hint" : undefined}
                value={createForm.reservationId}
                onChange={(e) => setCreateForm((s) => ({ ...s, reservationId: e.target.value }))}
                disabled={guestsLoading}
              >
                <option value="">
                  {guestsLoading ? "Loading guests…" : "Select a guest…"}
                </option>
                {inHouseGuests.map((g) => (
                  <option key={g.reservationId} value={g.reservationId}>
                    {g.roomCode ? `Room ${g.roomCode} · ` : ""}
                    {g.guestName} ({g.confirmationCode})
                    {g.isOverdue ? " (past checkout time)" : ""}
                  </option>
                ))}
              </select>
              {!guestsLoading && inHouseGuests.length === 0 ? (
                <p id="gs-new-guest-hint" className="mt-1 text-sm text-slate-600">
                  No guests are checked in right now.
                </p>
              ) : null}
            </div>
            <HmsField id="gs-new-team" label="Team">
              <select
                id="gs-new-team"
                className={hmsInput}
                value={createForm.department}
                onChange={(e) => setCreateForm((s) => ({ ...s, department: e.target.value }))}
              >
                <option value="">Choose a team…</option>
                {GUEST_REQUEST_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {GUEST_REQUEST_DEPARTMENT_LABELS[d]}
                  </option>
                ))}
              </select>
            </HmsField>
            <HmsField id="gs-new-type" label="What they asked for" hint="For example: extra towels.">
              <input
                id="gs-new-type"
                className={hmsInput}
                aria-describedby="gs-new-type-hint"
                value={createForm.requestType}
                onChange={(e) => setCreateForm((s) => ({ ...s, requestType: e.target.value }))}
              />
            </HmsField>
            <HmsField id="gs-new-details" label="Details" optional>
              <textarea
                id="gs-new-details"
                className={`${hmsInput} min-h-[72px]`}
                value={createForm.details}
                onChange={(e) => setCreateForm((s) => ({ ...s, details: e.target.value }))}
              />
            </HmsField>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label htmlFor="gs-new-priority" className="mb-1 block text-sm font-medium text-slate-800">
                  Priority
                </label>
                <select
                  id="gs-new-priority"
                  className={hmsInput}
                  value={createForm.priority}
                  onChange={(e) =>
                    setCreateForm((s) => ({ ...s, priority: e.target.value as typeof s.priority }))
                  }
                >
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                  <option value="vip">VIP</option>
                </select>
              </div>
              <label className="mb-2.5 flex items-center gap-2 text-sm font-medium text-slate-800">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-400 accent-emerald-700"
                  checked={createForm.billable}
                  onChange={(e) => setCreateForm((s) => ({ ...s, billable: e.target.checked }))}
                />
                The guest pays for this
              </label>
            </div>
            {!createForm.reservationId || !createForm.department || !createForm.requestType.trim() ? (
              <p className="text-sm text-slate-600">Choose a guest and a team, and say what they asked for, to save the request.</p>
            ) : null}
          </div>
          <DialogFooter>
            <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className={`${hmsButton.primary} ${focusRing}`}
              onClick={submitCreate}
              disabled={!createForm.reservationId || !createForm.department || !createForm.requestType.trim()}
            >
              Save request
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HmsPage>
  );
}

const GUEST_SERVICES_SKELETON_COLS = [
  { label: "Guest / room", minWidth: "min-w-[220px]" },
  { label: "Phone", minWidth: "min-w-[130px]" },
  { label: "Request ID", minWidth: "" },
  { label: "Created", minWidth: "min-w-[140px]" },
  { label: "Assignee", minWidth: "min-w-[140px]" },
  { label: "Service", minWidth: "min-w-[180px]" },
  { label: "Dept", minWidth: "" },
  { label: "Priority", minWidth: "" },
  { label: "Status", minWidth: "" },
  { label: "SLA", minWidth: "min-w-[140px]" },
  { label: "Billing", minWidth: "" },
  { label: "Actions", minWidth: "" },
];

function GuestServicesTableSkeleton() {
  return (
    <section aria-hidden className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1320px] text-left text-sm">
          <thead className="border-b bg-slate-50">
            <tr>
              {GUEST_SERVICES_SKELETON_COLS.map((col) => (
                <th key={col.label} className={`${col.minWidth} px-4 py-3`}>
                  <Skeleton className="h-3 w-16 bg-slate-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-32 bg-slate-200" />
                  <Skeleton className="mt-1.5 h-3 w-24 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-20 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-16 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-24 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-20 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-4 w-28 bg-slate-200" />
                  <Skeleton className="mt-1.5 h-3 w-20 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-16 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-12 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-6 w-20 rounded-full bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-24 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-3.5 w-12 bg-slate-200" />
                </td>
                <td className="px-4 py-3">
                  <Skeleton className="h-8 w-14 rounded-md bg-slate-200" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const words = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Nothing() {
  return (
    <span className="text-slate-600">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
  );
}

function GuestServiceTableRow({ row, onOpen }: { row: GuestRequestRow; onOpen: () => void }) {
  const delayed =
    row.expectedCompletedAt &&
    !["completed", "cancelled"].includes(row.status) &&
    new Date(row.expectedCompletedAt).getTime() < Date.now();
  const shortId = row.id.slice(0, 8);
  return (
    <tr className="border-b border-slate-100 text-slate-700 hover:bg-amber-50/40">
      <td className="whitespace-nowrap px-4 py-3">
        <p className="font-medium text-slate-900">{row.guestName ?? "No guest linked"}</p>
        <p className="flex items-center gap-2 text-xs text-slate-600">
          {row.roomCode ? `Room ${row.roomCode}` : "No room"} · {row.confirmationCode ?? "No booking"}
          {row.isVipSnapshot ? <HmsPill tone="amber">VIP</HmsPill> : null}
        </p>
      </td>
      <td className="whitespace-nowrap px-4 py-3">{row.guestPhone ?? <Nothing />}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <code className="text-xs text-slate-800" title={row.id}>
            {shortId}…
          </code>
          <button
            type="button"
            className={`${hmsButton.quiet} px-1.5 py-1 text-xs ${focusRing}`}
            onClick={() => void navigator.clipboard.writeText(row.id)}
          >
            Copy<span className="sr-only"> request number</span>
          </button>
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-3">{new Date(row.createdAt).toLocaleString("en-GB")}</td>
      <td className="whitespace-nowrap px-4 py-3">{row.assignedStaffName ?? "Not assigned"}</td>
      <td className="whitespace-nowrap px-4 py-3">
        <p className="font-medium text-slate-900">{row.requestType}</p>
        <p className="text-xs capitalize text-slate-600">{row.serviceCategory.replace(/_/g, " ")}</p>
      </td>
      <td className="px-4 py-3 capitalize">{row.department.replace(/_/g, " ")}</td>
      <td className="px-4 py-3">
        <HmsPill tone={row.priority === "urgent" ? "red" : row.priority === "vip" || row.priority === "high" ? "amber" : "slate"}>
          {words(row.priority)}
        </HmsPill>
      </td>
      <td className="px-4 py-3">
        <HmsPill
          tone={
            row.status === "completed" ? "green" : row.status === "cancelled" ? "slate" : row.status === "escalated" ? "red" : "blue"
          }
        >
          {words(row.status)}
        </HmsPill>
      </td>
      <td className="whitespace-nowrap px-4 py-3">
        {row.expectedCompletedAt ? (
          <span className={delayed ? "inline-flex items-center gap-1 font-semibold text-red-700" : ""}>
            {delayed ? <Clock className="h-3.5 w-3.5" aria-hidden /> : null}
            {new Date(row.expectedCompletedAt).toLocaleString("en-GB")}
            {delayed ? <span className="sr-only"> (running late)</span> : null}
          </span>
        ) : (
          <Nothing />
        )}
      </td>
      <td className="px-4 py-3">
        {row.billable ? (
          row.folioLineId ? (
            <HmsPill tone="green">On the bill</HmsPill>
          ) : (
            <HmsPill tone="amber">Not billed yet</HmsPill>
          )
        ) : (
          <span className="text-slate-600">Free</span>
        )}
      </td>
      <td className="px-4 py-3">
        <button type="button" className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`} onClick={onOpen}>
          View<span className="sr-only"> {row.requestType}</span>
        </button>
      </td>
    </tr>
  );
}
