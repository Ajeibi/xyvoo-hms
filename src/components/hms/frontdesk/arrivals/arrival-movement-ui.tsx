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
    "rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-slate-100/80",
    isDelayed ? "border-l-4 border-l-red-500 bg-white" : "bg-transparent",
  );
}

export function ArrivalMovementBadge({
  variant,
}: {
  variant: "soon" | "overdue" | "delayed" | null;
}) {
  if (!variant) return null;
  if (variant === "soon") {
    return (
      <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
        Due soon
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-800">
      Delayed
    </span>
  );
}
