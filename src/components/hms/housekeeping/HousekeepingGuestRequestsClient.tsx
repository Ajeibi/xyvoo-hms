"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlarmClock, BellRing, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { GuestRequestRow } from "@/lib/hms/guest-services";
import type { GuestServicesRoleCapabilities } from "@/lib/hms/guest-services-rbac";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";
import { FrontDeskGuestServiceDetailSheet } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServiceDetailSheet";

export function HousekeepingGuestRequestsClient({
  slug,
  tenantId,
  requests,
  capabilities,
  canAccessAllDepartments,
}: {
  slug: string;
  tenantId: string;
  requests: GuestRequestRow[];
  capabilities: GuestServicesRoleCapabilities;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  useFrontDeskRealtime(tenantId, true);

  const openRequests = requests.filter((r) => !["completed", "cancelled"].includes(r.status));
  const doneRequests = requests.filter((r) => ["completed", "cancelled"].includes(r.status));

  const openCard = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  };

  const startBusy = (id: string) => setBusyIds((prev) => new Set(prev).add(id));
  const stopBusy = (id: string) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const markDone = async (id: string) => {
    startBusy(id);
    try {
      const res = await fetch(`/api/hotel/housekeeping/guest-requests/${id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not close request", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Request closed.");
      router.refresh();
    } finally {
      stopBusy(id);
    }
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="guests"
        title="Guest requests"
        description="Requests raised by the front desk for housekeeping. Requests for other departments don't show here."
        actions={
          <button type="button" className={hmsButton.secondary} onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
            Refresh
          </button>
        }
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {openRequests.length === 0 ? (
        <HmsEmptyState
          art="bell"
          meaning="guests"
          title="No open guest requests"
          description="When the front desk sends a request to housekeeping, such as extra towels, it appears here."
        />
      ) : (
        <HmsCard
          id="housekeeping-open-requests"
          title="Open requests"
          description={`${openRequests.length} waiting for someone`}
          icon={BellRing}
          meaning="guests"
        >
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {openRequests.map((row) => (
              <li key={row.id}>
                <GuestRequestCard
                  row={row}
                  busy={busyIds.has(row.id)}
                  onOpen={() => openCard(row.id)}
                  onMarkDone={() => void markDone(row.id)}
                />
              </li>
            ))}
          </ul>
        </HmsCard>
      )}

      {doneRequests.length > 0 ? (
        <HmsCard id="housekeeping-done-requests" title="Recently completed" icon={CheckCircle2} meaning="guests">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {doneRequests.slice(0, 9).map((row) => (
              <li key={row.id}>
                <GuestRequestCard row={row} busy={false} onOpen={() => openCard(row.id)} />
              </li>
            ))}
          </ul>
        </HmsCard>
      ) : null}

      <FrontDeskGuestServiceDetailSheet
        slug={slug}
        requestId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        capabilities={capabilities}
        onUpdated={() => router.refresh()}
      />
    </HmsPage>
  );
}

const REQUEST_STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  completed: "green",
  cancelled: "slate",
  escalated: "red",
};

function GuestRequestCard({
  row,
  busy,
  onOpen,
  onMarkDone,
}: {
  row: GuestRequestRow;
  busy: boolean;
  onOpen: () => void;
  onMarkDone?: () => void;
}) {
  const delayed =
    row.expectedCompletedAt &&
    !["completed", "cancelled"].includes(row.status) &&
    new Date(row.expectedCompletedAt).getTime() < Date.now();

  return (
    <div className={cn("h-full rounded-2xl border p-4", delayed ? "border-rose-200 bg-rose-50/40" : "border-amber-100 bg-amber-50/40")}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="flex flex-wrap items-center gap-2 font-heading text-lg font-semibold text-slate-900">
            {row.requestType}
            {row.isVipSnapshot ? (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-800 ring-1 ring-violet-200">VIP</span>
            ) : null}
          </p>
          <p className="text-sm text-slate-700">
            {row.roomCode ? `Room ${row.roomCode} · ` : ""}
            {row.guestName ?? "Guest"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="capitalize">
          <HmsPill tone={REQUEST_STATUS_TONE[row.status] ?? "blue"}>{row.status.replace(/_/g, " ")}</HmsPill>
        </span>
        <span className="text-xs text-slate-600">{formatDateTime(row.createdAt)}</span>
      </div>

      {row.expectedCompletedAt ? (
        <p className={cn("mt-2 flex items-center gap-1 text-xs", delayed ? "font-semibold text-rose-700" : "text-slate-600")}>
          {delayed ? <AlarmClock className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}
          {delayed ? "Late. Was due " : "Due "}
          {formatDateTime(row.expectedCompletedAt)}
        </p>
      ) : null}

      {row.details ? <p className="mt-2 text-sm text-slate-700">{row.details}</p> : null}

      <div className="mt-4 flex gap-2">
        <button type="button" className={cn(hmsButton.secondary, "flex-1")} onClick={onOpen}>
          View
        </button>
        {onMarkDone ? (
          <button type="button" className={cn(hmsButton.primary, "flex-1")} disabled={busy} onClick={onMarkDone}>
            {busy ? "Closing…" : "Mark done"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
