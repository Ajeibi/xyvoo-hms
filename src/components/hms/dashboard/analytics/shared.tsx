import type { ReactNode } from "react";
import { formatCurrencySymbol } from "@/lib/hms/room-pricing";

export type StatusTone = "info" | "warning" | "critical";

export type MetricTileItem = {
  label: string;
  value: string;
  description: string;
};

export type SummaryTileItem = {
  label: string;
  value: string;
  caption: string;
};

export type StatusRowItem = {
  title: string;
  detail: string;
  tone: StatusTone;
  value?: string;
};

export type AnalyticsIcon = React.ComponentType<{ className?: string }>;

export function AnalyticsCard({
  icon: Icon,
  title,
  description,
  children,
  badge = "Preview",
}: {
  icon: AnalyticsIcon;
  title: string;
  description: string;
  children: ReactNode;
  /** Pass `null` to hide the badge pill */
  badge?: string | null;
}) {
  const badgeClass =
    badge === "Live"
      ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
      : "bg-slate-100 text-slate-500";

  return (
    <section className="h-full rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
              {badge ? (
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${badgeClass}`}
                >
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
          </div>
        </div>
      </div>

      <div className="mt-6">{children}</div>
    </section>
  );
}

export function MetricTile({ label, value, description }: MetricTileItem) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-6 text-slate-500">{description}</p>
    </div>
  );
}

export function SummaryTile({ label, value, caption }: SummaryTileItem) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
      <p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{caption}</p>
    </div>
  );
}

export function StatusRow({ title, detail, value, tone }: StatusRowItem) {
  const toneClasses = {
    info: "border-blue-200 bg-blue-50/70 text-blue-700",
    warning: "border-amber-200 bg-amber-50/70 text-amber-800",
    critical: "border-rose-200 bg-rose-50/70 text-rose-700",
  };

  return (
    <div className={`rounded-2xl border px-4 py-4 ${toneClasses[tone]}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-6 opacity-90">{detail}</p>
        </div>
        {value ? <span className="shrink-0 text-sm font-semibold">{value}</span> : null}
      </div>
    </div>
  );
}

export function sumValues(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

export function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function formatCompactAmount(amount: number, currency: string) {
  if (!Number.isFinite(amount)) return "0";

  const normalizedCurrency = currency.trim().toUpperCase();
  const symbol = formatCurrencySymbol(normalizedCurrency);
  const spacer = /\p{L}/u.test(symbol) ? " " : "";
  const formatted = new Intl.NumberFormat("en-NG", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);

  if (symbol && symbol !== normalizedCurrency) {
    return `${symbol}${spacer}${formatted}`;
  }

  return `${normalizedCurrency} ${formatted}`;
}
