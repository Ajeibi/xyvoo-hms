import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { HMS_MEANING, type HmsMeaning } from "./meaning";

/*
 * Figure tiles shared by the hotel dashboards. Display only, so server pages and client
 * components can both use them.
 */

type TileIcon = React.ComponentType<{ className?: string }>;

/**
 * A figure on a soft meaning-coloured tile: what it is, the number, and one line of context.
 * `status` flags a figure that needs someone, with words and an icon as well as colour.
 */
export function HmsStatTile({
  label,
  value,
  hint,
  icon: Icon,
  meaning,
  href,
  status,
  statusText,
  id,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon: TileIcon;
  meaning: HmsMeaning;
  href?: string;
  status?: "warning" | "critical";
  /** Words for the status flag; defaults to "Needs attention". */
  statusText?: string;
  id?: string;
}) {
  const tone = HMS_MEANING[meaning];
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${tone.iconBox}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-0.5 font-heading text-2xl font-bold tracking-tight tabular-nums text-slate-900">{value}</p>
      {status ? (
        <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${status === "critical" ? "text-red-700" : "text-amber-800"}`}>
          <CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {statusText ?? "Needs attention"}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs leading-5 text-slate-600">{hint}</p>
      ) : null}
    </>
  );
  const className = `block rounded-2xl p-4 ${tone.tint}`;
  return href ? (
    <Link
      id={id}
      href={href}
      className={`${className} transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
    >
      {body}
    </Link>
  ) : (
    <div id={id} className={className}>
      {body}
    </div>
  );
}

/** The coloured icon square that sits beside a card or link title. */
export function HmsIconBadge({ icon: Icon, meaning, size = "md" }: { icon: TileIcon; meaning: HmsMeaning; size?: "md" | "lg" }) {
  const tone = HMS_MEANING[meaning];
  const box = size === "lg" ? "h-11 w-11 rounded-2xl" : "h-10 w-10 rounded-xl";
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center ${box} ${tone.tint} ${tone.icon} ring-1 ring-slate-200/60 shadow-xs`}>
      <Icon className="h-5 w-5" />
    </span>
  );
}
