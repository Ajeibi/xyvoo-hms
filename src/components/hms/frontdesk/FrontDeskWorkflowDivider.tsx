export function FrontDeskWorkflowDivider({ label }: { label: string }) {
  return (
    <div
      className="relative my-10 flex items-center gap-4"
      role="separator"
      aria-label={label}
    >
      <div className="h-px flex-1 bg-slate-200" />
      <span className="shrink-0 rounded-full bg-sky-50 px-4 py-1.5 text-sm font-semibold text-sky-900">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
