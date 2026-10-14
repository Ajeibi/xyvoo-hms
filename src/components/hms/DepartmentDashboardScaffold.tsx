import Link from "next/link";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";

type DepartmentHighlight = {
  label: string;
  value: string;
  detail: string;
};

/** Tiles cycle through these so a department page reads as colourful as the main dashboard. */
const HIGHLIGHT_MEANINGS: HmsMeaning[] = ["rooms", "money", "guests", "stock", "care", "food"];

export default function DepartmentDashboardScaffold({
  title,
  subtitle,
  settingsHref,
  settingsLabel = "Open settings",
  highlights,
  meaning = "neutral",
}: {
  title: string;
  subtitle: string;
  settingsHref: string;
  settingsLabel?: string;
  highlights: DepartmentHighlight[];
  /** The department's own colour, used for the heading accent. */
  meaning?: HmsMeaning;
}) {
  const tone = HMS_MEANING[meaning];
  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className={`h-10 w-1.5 rounded-full ${tone.dot}`} />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
            <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p>
          </div>
        </div>

        <Link
          href={settingsHref}
          className="inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {settingsLabel}
        </Link>
      </div>

      <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {highlights.map((item, index) => {
          const itemTone = HMS_MEANING[HIGHLIGHT_MEANINGS[index % HIGHLIGHT_MEANINGS.length]];
          return (
            <div key={item.label} className={`rounded-2xl p-5 ${itemTone.tint}`}>
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-slate-600">
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${itemTone.dot}`} />
                {item.label}
              </p>
              <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{item.value}</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800">Department Workspace</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          This dashboard is scoped to the {title.toLowerCase()} team. Use the
          sidebar to stay inside this department and open its settings when you
          need to adjust workflows, defaults, or operational rules.
        </p>
      </div>
    </div>
  );
}
