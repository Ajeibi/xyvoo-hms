import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, CircleAlert } from "lucide-react";
import { Illustration, type IllustrationName } from "./illustrations";
import { MEANING, type Meaning } from "./meaning";

/*
 * Dashboard building blocks that only display things, with no state or browser APIs, so server
 * pages and client components can both use them. Interactive pieces (section intros, filter
 * chips) live in dashboard-ui.tsx, which also re-exports these for client components.
 */
export const dashInput =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue aria-[invalid=true]:border-red-500";

export function DashField({ id, label, hint, optional, children }: { id: string; label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label} {optional ? <span className="font-normal text-slate-500">(optional)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function DashAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

export function DashStatus({ message }: { message: string }) {
  return (
    <p role="status" className="text-sm text-emerald-700">
      {message}
    </p>
  );
}

/*
 * Page building blocks, so every dashboard screen reads the same way:
 * a heading that says what the page is for, cards with a plain title and
 * one line of help, and empty states that say what to do next.
 */

/** The top of a dashboard page: title, one sentence on what it's for, and optional buttons on the right. */
export function DashPageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1 text-base text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A white card section. Give it an id-based title so screen readers can jump between sections. */
export function DashCard({
  id,
  title,
  description,
  icon: Icon,
  meaning = "neutral",
  actions,
  children,
  className = "",
}: {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  meaning?: Meaning;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const titleId = id ? `${id}-title` : undefined;
  const tone = MEANING[meaning];
  return (
    <section aria-labelledby={title ? titleId : undefined} className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6 ${className}`}>
      {title ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            {Icon ? (
              <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.tint} ${tone.icon} ring-1 ring-slate-200/60 shadow-xs`}>
                <Icon className="h-5 w-5" />
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 id={titleId} className="font-heading text-base font-semibold text-slate-900">
                {title}
              </h2>
              {description ? <p className="mt-0.5 text-sm text-slate-600">{description}</p> : null}
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * What a list looks like before there's anything in it: a small drawing, what will appear here,
 * and the first thing to do. `art` picks the drawing; without it the icon is shown instead.
 */
export function DashEmptyState({
  icon: Icon,
  art,
  meaning = "neutral",
  title,
  description,
  action,
  secondary,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  art?: IllustrationName;
  meaning?: Meaning;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** A quieter second step, such as a "See how" link. */
  secondary?: React.ReactNode;
}) {
  const tone = MEANING[meaning];
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm">
      {art ? (
        <span className={tone.icon}>
          <Illustration name={art} />
        </span>
      ) : Icon ? (
        <span aria-hidden className={`flex h-12 w-12 items-center justify-center rounded-2xl ${tone.tint} ${tone.icon}`}>
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <p className="mt-3 font-heading text-lg font-semibold text-slate-900">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action || secondary ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          {action}
          {secondary}
        </div>
      ) : null}
    </div>
  );
}

/**
 * A figure on a soft meaning-coloured tile: what it is, the number, and how it compares.
 * `value` null shows a loading shimmer. `change` is the percentage against the period before.
 */
export function DashStatTile({
  label,
  value,
  hint,
  change,
  changeWords = "on the month before",
  icon: Icon,
  meaning,
  href,
  onClick,
  pressed,
  upIsGood = true,
}: {
  label: string;
  value: React.ReactNode | null;
  hint?: string;
  change?: number | null;
  changeWords?: string;
  icon: React.ComponentType<{ className?: string }>;
  meaning: Meaning;
  href?: string;
  /** Makes the tile a filter button instead of a link; `pressed` marks the one that's on. */
  onClick?: () => void;
  pressed?: boolean;
  /** For figures where a fall is good news (refunds, sold-out items), the arrow colours flip. */
  upIsGood?: boolean;
}) {
  const tone = MEANING[meaning];
  const good = change == null || change === 0 ? null : change > 0 === upIsGood;
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${tone.iconBox}`}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      {value === null ? (
        <div className="mt-1 h-8 w-24 animate-pulse rounded-lg bg-white/80 motion-reduce:animate-none" />
      ) : (
        <p className="mt-0.5 font-heading text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      )}
      <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
        {change != null && value !== null ? (
          change === 0 ? (
            <>Same as {changeWords.replace(/^on /, "")}</>
          ) : (
            <>
              {change > 0 ? (
                <ArrowUpRight className={`h-3.5 w-3.5 ${good ? "text-emerald-700" : "text-red-700"}`} aria-hidden />
              ) : (
                <ArrowDownRight className={`h-3.5 w-3.5 ${good ? "text-emerald-700" : "text-red-700"}`} aria-hidden />
              )}
              {Math.abs(change)}% {change > 0 ? "up" : "down"} {changeWords}
            </>
          )
        ) : (
          hint
        )}
      </p>
    </>
  );
  const className = `block rounded-2xl p-4 ${tone.tint}`;
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={pressed}
        className={`${className} w-full text-left ring-offset-2 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue ${pressed ? "ring-2 ring-slate-800" : ""}`}
      >
        {body}
      </button>
    );
  }
  return href ? (
    <Link href={href} className={`${className} transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/** A row of figure tiles at the top of a page. */
export function DashStatStrip({ label, children, columns = 4 }: { label: string; children: React.ReactNode; columns?: 3 | 4 }) {
  return (
    <section aria-label={label} className={`grid grid-cols-2 gap-3 ${columns === 3 ? "md:grid-cols-3" : "lg:grid-cols-4"}`}>
      {children}
    </section>
  );
}

/** The percentage change between two figures, or null when there's nothing to compare with. */
export function percentChange(now: number, before: number) {
  if (!before) return null;
  return Math.round(((now - before) / before) * 100);
}

/** Buttons that match across screens. */
export const dashButton = {
  primary: "inline-flex items-center justify-center gap-2 rounded-xl bg-xyvoo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50",
  quiet: "inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50",
  danger: "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50",
};

/** A small coloured label for a state ("Active", "Sold out"). */
export function DashPill({ tone = "slate", children }: { tone?: "slate" | "green" | "amber" | "red" | "blue"; children: React.ReactNode }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-50 text-emerald-800",
    amber: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
    blue: "bg-blue-50 text-blue-800",
  };
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
