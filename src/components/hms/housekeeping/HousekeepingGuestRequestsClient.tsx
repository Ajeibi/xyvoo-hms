"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Guest requests</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Requests raised by Front Desk and routed to Housekeeping — nothing from other departments shows up here.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("mr-2 h-4 w-4", refreshing && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {openRequests.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No open guest requests for Housekeeping.
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {openRequests.map((row) => (
            <GuestRequestCard
              key={row.id}
              row={row}
              busy={busyIds.has(row.id)}
              onOpen={() => openCard(row.id)}
              onMarkDone={() => void markDone(row.id)}
            />
          ))}
        </div>
      )}

      {doneRequests.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-600">Recently completed</h2>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {doneRequests.slice(0, 9).map((row) => (
              <GuestRequestCard key={row.id} row={row} busy={false} onOpen={() => openCard(row.id)} />
            ))}
          </div>
        </div>
      ) : null}

      <FrontDeskGuestServiceDetailSheet
        slug={slug}
        requestId={selectedId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        capabilities={capabilities}
        onUpdated={() => router.refresh()}
      />
    </div>
  );
}

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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-slate-900">
            {row.requestType}
            {row.isVipSnapshot ? (
              <span className="ml-2 rounded bg-amber-100 px-1.5 text-[10px] font-bold text-amber-900">VIP</span>
            ) : null}
          </p>
          <p className="text-sm text-slate-500">
            {row.roomCode ? `Room ${row.roomCode} · ` : ""}
            {row.guestName ?? "Guest"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-semibold",
            row.status === "completed" && "bg-emerald-100 text-emerald-900",
            row.status === "cancelled" && "bg-slate-200 text-slate-700",
            row.status === "escalated" && "bg-red-100 text-red-800",
            !["completed", "cancelled", "escalated"].includes(row.status) && "bg-blue-50 text-blue-800",
          )}
        >
          {row.status.replace(/_/g, " ")}
        </span>
        <span className="text-xs text-slate-400">{formatDateTime(row.createdAt)}</span>
      </div>

      {row.expectedCompletedAt ? (
        <p className={cn("mt-2 text-xs", delayed ? "font-semibold text-red-600" : "text-slate-500")}>
          SLA {formatDateTime(row.expectedCompletedAt)}
        </p>
      ) : null}

      {row.details ? <p className="mt-2 text-sm text-slate-600">{row.details}</p> : null}

      <div className="mt-4 flex gap-2">
        <Button type="button" variant="outline" className="flex-1 rounded-lg" onClick={onOpen}>
          View
        </Button>
        {onMarkDone ? (
          <Button type="button" className="flex-1 rounded-lg" disabled={busy} onClick={onMarkDone}>
            {busy ? "Closing…" : "Mark done"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
