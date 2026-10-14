import type { ReactNode } from "react";
import { formatCurrencySymbol } from "@/lib/hms/room-pricing";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";

export type StatusTone = "info" | "warning" | "critical";

export type MetricTileItem = {
  label: string;
  value: string;
  description: string;
  /** Tints the tile; without it the tile stays a quiet grey. */
  meaning?: HmsMeaning;
};

export type SummaryTileItem = {
  label: string;
  value: string;
  caption: string;
  meaning?: HmsMeaning;
};

function tileSurface(meaning?: HmsMeaning) {
  return meaning ? `${HMS_MEANING[meaning].tint}` : "border border-slate-200 bg-slate-50/80";
}

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
  meaning = "rooms",
  children,
}: {
  icon: AnalyticsIcon;
  title: string;
  description: string;
  /** The card's colour, from the part of the hotel it reports on. */
  meaning?: HmsMeaning;
  children: ReactNode;
}) {
  const tone = HMS_MEANING[meaning];
  return (
    <section className="h-full rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-slate-200/60 ${tone.tint} ${tone.icon}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
          </div>
        </div>
      </div>

      <div className="mt-6">{children}</div>
    </section>
  );
}

export function MetricTile({ label, value, description, meaning }: MetricTileItem) {
  return (
    <div className={`rounded-2xl px-4 py-4 ${tileSurface(meaning)}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-600">
        {meaning ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${HMS_MEANING[meaning].dot}`} /> : null}
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-2 text-xs leading-6 text-slate-600">{description}</p>
    </div>
  );
}

export function SummaryTile({ label, value, caption, meaning }: SummaryTileItem) {
  return (
    <div className={`rounded-2xl px-4 py-4 ${tileSurface(meaning)}`}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-600">
        {meaning ? <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${HMS_MEANING[meaning].dot}`} /> : null}
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{caption}</p>
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
