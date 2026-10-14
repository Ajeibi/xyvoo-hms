"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown when a live screen could not refresh: the last good data stays on screen, and staff
 * are told how old it is rather than left to assume it is current.
 */
export function StaleDataNotice({
  what,
  since,
  onRetry,
  retrying,
}: {
  /** What failed to refresh, e.g. "the rooms". */
  what: string;
  /** When the data on screen was last loaded successfully. */
  since: Date;
  onRetry: () => void;
  retrying?: boolean;
}) {
  const time = since.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700" aria-hidden />
      <p className="min-w-0 flex-1">
        We couldn&apos;t refresh {what} just now, so you&apos;re seeing the information from {time}. We&apos;ll
        keep trying.
      </p>
      <Button type="button" size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
        {retrying ? "Trying again…" : "Try again"}
      </Button>
    </div>
  );
}
