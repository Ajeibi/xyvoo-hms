import { TriangleAlert } from "lucide-react";
import { Illustration, type IllustrationName } from "@/components/storefront/illustrations";
import { HMS_MEANING, type HmsMeaning } from "./meaning";

/*
 * The hotel dashboard's page building blocks: the same look as the store dashboard
 * (components/storefront/dashboard-blocks.tsx), coloured with the hotel's meaning colours.
 * Display only, so server pages and client components can both use them. Interactive
 * pieces (section intros, filter chips) live in hms-ui-client.tsx.
 */

// Meaning-free pieces are shared with the store dashboard as they are.
export {
  dashInput as hmsInput,
  DashField as HmsField,
  DashAlert as HmsAlert,
  DashStatus as HmsStatus,
  DashPill as HmsPill,
  percentChange,
} from "@/components/storefront/dashboard-blocks";
export { HmsStatTile, HmsIconBadge } from "./dashboard-tiles";

type HmsIcon = React.ComponentType<{ className?: string }>;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

/**
 * Buttons that match across hotel screens. The filled button uses the deeper hotel blue, because
 * white on the standard hotel blue is only about 4.1:1.
 */
export const hmsButton = {
  primary: `inline-flex items-center justify-center gap-2 rounded-xl bg-xyvoo-blue-deep px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  secondary: `inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  /** A compact secondary button for actions inside table rows and list items. */
  small: `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`,
  quiet: `inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 ${FOCUS}`,
  danger: `inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 ${FOCUS}`,
};

/** A caution note (amber, with an icon), for things to know that aren't errors. */
export function HmsWarning({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <div>
        {title ? <p className="font-semibold">{title}</p> : null}
        <div>{children}</div>
      </div>
    </div>
  );
}

/**
 * The top of a hotel page: a coloured eyebrow naming the department, the title, one sentence on
 * what the page is for, and optional buttons on the right.
 */
export function HmsPageHeader({
  title,
  description,
  eyebrow,
  meaning = "neutral",
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  /** The department, e.g. "Front desk". */
  eyebrow?: string;
  meaning?: HmsMeaning;
  actions?: React.ReactNode;
}) {
  const tone = HMS_MEANING[meaning];
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-2xl">
        {eyebrow ? (
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
            <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />
            {eyebrow}
          </p>
        ) : null}
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.75rem]">{title}</h1>
        {description ? <p className="mt-1 text-base text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

/** A white card section with a coloured icon. Give it an id so screen readers can jump between sections. */
export function HmsCard({
  id,
  title,
  description,
  icon: Icon,
  meaning = "neutral",
  actions,
  children,
  className = "",
  flush = false,
}: {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon?: HmsIcon;
  meaning?: HmsMeaning;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** No inner padding below the title, for tables and lists that run edge to edge. */
  flush?: boolean;
}) {
  const titleId = id ? `${id}-title` : undefined;
  const tone = HMS_MEANING[meaning];
  return (
    <section
      aria-labelledby={title ? titleId : undefined}
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm ${flush ? "overflow-hidden" : "p-5 sm:p-6"} ${className}`}
    >
      {title ? (
        <div className={`flex flex-wrap items-start justify-between gap-3 ${flush ? "border-b border-slate-100 px-5 py-4 sm:px-6" : "mb-4"}`}>
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
 * What a list looks like before there's anything in it: a small drawing (or icon), what will
 * appear here, and the first thing to do.
 */
export function HmsEmptyState({
  icon: Icon,
  art,
  meaning = "neutral",
  title,
  description,
  action,
  secondary,
  bare = false,
}: {
  icon?: HmsIcon;
  art?: IllustrationName;
  meaning?: HmsMeaning;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  /** Inside a card already: no border or shadow of its own. */
  bare?: boolean;
}) {
  const tone = HMS_MEANING[meaning];
  return (
    <div className={`flex flex-col items-center px-6 py-10 text-center ${bare ? "" : "rounded-2xl border border-slate-200 bg-white shadow-sm"}`}>
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

/** A row of figure tiles at the top of a page. */
export function HmsStatStrip({ label, children, columns = 4 }: { label: string; children: React.ReactNode; columns?: 3 | 4 }) {
  return (
    <section aria-label={label} className={`grid grid-cols-2 gap-3 ${columns === 3 ? "md:grid-cols-3" : "lg:grid-cols-4"}`}>
      {children}
    </section>
  );
}

/** The standard page frame: consistent gutters and spacing between sections. */
export function HmsPage({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return <div className={`mx-auto w-full space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 ${wide ? "max-w-[1500px]" : "max-w-6xl"}`}>{children}</div>;
}
