import { AlarmClock, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Table row highlight from arrivals workbench */
export type ArrivalTableHighlight = "none" | "soon" | "overdue";

export function arrivalRowSurfaceClasses(highlight: ArrivalTableHighlight, index: number) {
  const zebra = index % 2 === 0 ? "bg-white" : "bg-slate-50";
  if (highlight === "soon") return cn(zebra, "border-l-4 border-l-amber-400");
  if (highlight === "overdue") return cn(zebra, "border-l-4 border-l-red-500");
  return zebra;
}

export function timelineItemSurfaceClasses(isDelayed: boolean) {
  return cn(
    "rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
    isDelayed ? "border-l-4 border-l-red-500 bg-white" : "bg-transparent",
  );
}

/** Labels a late or nearly-due arrival in words and an icon as well as colour. */
export function ArrivalMovementBadge({
  variant,
}: {
  variant: "soon" | "overdue" | "delayed" | null;
}) {
  if (!variant) return null;
  if (variant === "soon") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
        <AlarmClock className="h-3 w-3" aria-hidden />
        Due soon
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
      <CircleAlert className="h-3 w-3" aria-hidden />
      Delayed
    </span>
  );
}
