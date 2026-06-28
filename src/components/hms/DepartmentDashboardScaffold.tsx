import Link from "next/link";

type DepartmentHighlight = {
  label: string;
  value: string;
  detail: string;
};

export default function DepartmentDashboardScaffold({
  title,
  subtitle,
  settingsHref,
  settingsLabel = "Open settings",
  highlights,
}: {
  title: string;
  subtitle: string;
  settingsHref: string;
  settingsLabel?: string;
  highlights: DepartmentHighlight[];
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>
        </div>

        <Link
          href={settingsHref}
          className="inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          {settingsLabel}
        </Link>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {highlights.map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-slate-400">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-900">{item.value}</p>
            <p className="mt-2 text-sm leading-6 text-slate-500">{item.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-800">Department Workspace</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          This dashboard is scoped to the {title.toLowerCase()} team. Use the
          sidebar to stay inside this department and open its settings when you
          need to adjust workflows, defaults, or operational rules.
        </p>
      </div>
    </div>
  );
}
