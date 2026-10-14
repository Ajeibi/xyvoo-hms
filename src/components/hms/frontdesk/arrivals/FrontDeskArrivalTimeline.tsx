"use client";

import { useEffect, useState } from "react";
import { ArrivalMovementBadge, timelineItemSurfaceClasses } from "./arrival-movement-ui";
import { HmsEmptyState } from "@/components/hms/hms-ui";
import { cn } from "@/lib/utils";

type TimelineItem = {
  reservationId: string;
  confirmationCode: string;
  guestName: string;
  arrivalAt: string;
  status: string;
  isVip: boolean;
  isGroup: boolean;
  highlight: string;
};

type TimelineBucket = {
  hour: number;
  items: TimelineItem[];
};

export function FrontDeskArrivalTimeline({
  slug,
  preset,
  customStart,
  customEnd,
  onSelectReservation,
}: {
  slug: string;
  preset: string;
  customStart?: string;
  customEnd?: string;
  onSelectReservation?: (reservationId: string) => void;
}) {
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = new URLSearchParams({ slug, preset });
    if (customStart) params.set("start", customStart);
    if (customEnd) params.set("end", customEnd);
    setLoading(true);
    fetch(`/api/hotel/frontdesk/arrivals/timeline?${params}`)
      .then((r) => r.json())
      .then((d) => setBuckets(d.buckets ?? []))
      .catch(() => setBuckets([]))
      .finally(() => setLoading(false));
  }, [slug, preset, customStart, customEnd]);

  if (loading) {
    return (
      <p role="status" className="text-sm text-slate-600">
        Loading arrivals by hour…
      </p>
    );
  }

  if (buckets.length === 0) {
    return (
      <HmsEmptyState
        art="people"
        meaning="rooms"
        title="No arrivals in these dates"
        description="When guests are booked to arrive, you'll see them here grouped by the hour they're due."
      />
    );
  }

  return (
    <div className="space-y-4">
      {buckets.map((bucket) => (
        <div key={bucket.hour} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <span aria-hidden className="h-2 w-2 rounded-full bg-sky-500" />
            {String(bucket.hour).padStart(2, "0")}:00 UTC
          </h3>
          <ul className="mt-2 space-y-2">
            {bucket.items.map((item) => (
              <li key={item.reservationId}>
                <button
                  type="button"
                  onClick={() => onSelectReservation?.(item.reservationId)}
                  className={cn(
                    "flex w-full cursor-pointer flex-wrap items-center justify-between gap-2",
                    timelineItemSurfaceClasses(item.highlight === "delayed"),
                  )}
                >
                  <span className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    {item.guestName}
                    {item.isVip ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">VIP</span>
                    ) : null}
                    {item.isGroup ? (
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-900">Group</span>
                    ) : null}
                    <ArrivalMovementBadge
                      variant={item.highlight === "delayed" ? "delayed" : null}
                    />
                  </span>
                  <span className="text-slate-600">
                    {item.confirmationCode} · {item.status.replace(/_/g, " ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
