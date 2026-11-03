"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, CheckCircle2, RefreshCw } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, hmsButton } from "@/components/hms/hms-ui";
import { GuestRequestCard } from "@/components/hms/housekeeping/HousekeepingGuestRequestsClient";
import { FrontDeskGuestServiceDetailSheet } from "@/components/hms/frontdesk/guest-services/FrontDeskGuestServiceDetailSheet";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";
import type { GuestRequestRow } from "@/lib/hms/guest-services";
import type { GuestServicesRoleCapabilities } from "@/lib/hms/guest-services-rbac";

const isDone = (status: string) => status === "completed" || status === "cancelled";

export function FbGuestRequestsClient({
  slug,
  requests,
  capabilities,
}: {
  slug: string;
  requests: GuestRequestRow[];
  capabilities: GuestServicesRoleCapabilities;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const open = requests.filter((r) => !isDone(r.status));
  const done = requests.filter((r) => isDone(r.status));

  const refresh = () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  };

  const markDone = async (id: string) => {
    setBusyIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/hotel/fb/guest-requests/${id}/complete`, {
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
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  const view = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Food and drink"
        meaning="guests"
        title="Guest requests"
        description="Requests the front desk sent to food and drink, such as a welcome fruit basket. Requests for other departments don't show here."
        actions={
          <button type="button" className={hmsButton.secondary} onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} aria-hidden />
            Refresh
          </button>
        }
      />

      {open.length === 0 ? (
        <HmsEmptyState
          art="bell"
          meaning="guests"
          title="No open guest requests"
          description="When the front desk sends a welcome fruit basket or drink, it appears here."
        />
      ) : (
        <HmsCard
          id="fb-open-requests"
          title="Open requests"
          description={`${open.length} waiting for someone`}
          icon={BellRing}
          meaning="guests"
        >
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {open.map((row) => (
              <li key={row.id}>
                <GuestRequestCard
                  row={row}
                  busy={busyIds.has(row.id)}
                  onOpen={() => view(row.id)}
                  onMarkDone={() => void markDone(row.id)}
                />
              </li>
            ))}
          </ul>
        </HmsCard>
      )}

      {done.length > 0 ? (
        <HmsCard id="fb-done-requests" title="Recently completed" icon={CheckCircle2} meaning="guests">
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {done.slice(0, 9).map((row) => (
              <li key={row.id}>
                <GuestRequestCard row={row} busy={false} onOpen={() => view(row.id)} />
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
