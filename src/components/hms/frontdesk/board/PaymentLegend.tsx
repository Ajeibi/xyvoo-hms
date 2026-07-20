import { cn } from "@/lib/utils";
import { PAYMENT_DOT_CLASS, PAYMENT_LEGEND_KEYS, PAYMENT_STATUS_HINT, PAYMENT_STATUS_LABEL } from "./payment-styles";

function LegendDot({ className }: { className: string }) {
  return <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", className)} aria-hidden />;
}

/** Small "what do the payment dot colors mean" key — shared by the board legend and any
 * table (e.g. Arrivals) that shows the same payment-status dot without its own explanation. */
export function PaymentLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-slate-600", className)}>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Payment:</span>
      {PAYMENT_LEGEND_KEYS.map((key) => (
        <span key={key} className="flex items-center gap-1.5" title={PAYMENT_STATUS_HINT[key]}>
          <LegendDot className={PAYMENT_DOT_CLASS[key]} />
          {PAYMENT_STATUS_LABEL[key]}
        </span>
      ))}
    </div>
  );
}
