import { cn } from "@/lib/utils";
import type { FrontDeskDisplayStatus } from "@/lib/hms/front-desk-board";
import { PaymentLegend } from "./PaymentLegend";
import { ROOM_FLAG_RING_CLASS, SUMMARY_CARD_CLASS } from "./status-styles";

/** Built from the same maps the cells use, so the legend cannot drift from the board. */
const LEGEND_LABELS: Record<FrontDeskDisplayStatus, string> = {
  overdueCheckout: "Overdue checkout",
  available: "Available",
  reserved: "Reserved",
  dirty: "Dirty / cleaning",
  maintenance: "Maintenance",
  outOfService: "Out of service",
  inHouse: "In-house",
};
const ROOM_STATUS_LEGEND = (Object.keys(LEGEND_LABELS) as FrontDeskDisplayStatus[]).map((key) => ({
  label: LEGEND_LABELS[key],
  className: SUMMARY_CARD_CLASS[key],
}));

function LegendSwatch({
  className,
  shape,
}: {
  className: string;
  shape: "square" | "dot";
}) {
  return (
    <span
      className={cn(
        "shrink-0",
        shape === "square" ? "h-2.5 w-2.5 rounded-sm" : "h-2.5 w-2.5 rounded-full",
        className,
      )}
      aria-hidden
    />
  );
}

export function FrontDeskBoardLegend() {
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 px-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-700">
          Room status
        </p>
        <p className="mt-0.5 text-xs text-slate-600">Cell background color</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-700">
          {ROOM_STATUS_LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <LegendSwatch shape="square" className={item.className} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-3">
        <p className="text-sm font-medium text-slate-700">
          Payment
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          Small <strong className="font-semibold text-slate-600">circle</strong> in the top-right on
          occupied / reserved rooms (not the cell color)
        </p>
        <PaymentLegend className="mt-2" />
      </div>

      <div className="border-t border-slate-200/80 pt-3">
        <p className="text-sm font-medium text-slate-700">
          Room flags
        </p>
        <p className="mt-0.5 text-xs text-slate-600">
          <span
            aria-hidden
            className={`mr-1.5 inline-block h-3 w-3 rounded-sm bg-white align-[-2px] ${ROOM_FLAG_RING_CLASS}`}
          />
          Dark ring = DND, security hold, or staff-restricted · moon / shield icons on the cell
        </p>
      </div>
    </div>
  );
}
