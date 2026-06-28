import { cn } from "@/lib/utils";
import {
  PAYMENT_DOT_CLASS,
  PAYMENT_LEGEND_KEYS,
  PAYMENT_STATUS_HINT,
  PAYMENT_STATUS_LABEL,
} from "./payment-styles";

const ROOM_STATUS_LEGEND = [
  { label: "Overdue checkout", className: "bg-red-500" },
  { label: "Available", className: "bg-emerald-500" },
  { label: "Reserved", className: "bg-amber-400" },
  { label: "Dirty / cleaning", className: "bg-orange-500" },
  { label: "Maintenance", className: "bg-violet-500" },
  { label: "Out of service", className: "bg-slate-400" },
  { label: "In-house", className: "bg-blue-600" },
] as const;

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
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Room status
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">Cell background color</p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-medium text-slate-600">
          {ROOM_STATUS_LEGEND.map((item) => (
            <span key={item.label} className="flex items-center gap-1.5">
              <LegendSwatch shape="square" className={item.className} />
              {item.label}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Payment
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          Small <strong className="font-semibold text-slate-600">circle</strong> in the top-right on
          occupied / reserved rooms (not the cell color)
        </p>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-[10px] font-medium text-slate-600">
          {PAYMENT_LEGEND_KEYS.map((key) => (
            <span key={key} className="flex items-center gap-1.5" title={PAYMENT_STATUS_HINT[key]}>
              <LegendSwatch shape="dot" className={PAYMENT_DOT_CLASS[key]} />
              {PAYMENT_STATUS_LABEL[key]}
            </span>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200/80 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Room flags
        </p>
        <p className="mt-0.5 text-[10px] text-slate-500">
          Violet ring = DND, security hold, or staff-restricted · moon / shield icons on the cell
        </p>
      </div>
    </div>
  );
}
