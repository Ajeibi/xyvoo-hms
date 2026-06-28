export function FrontDeskWorkflowDivider({ label }: { label: string }) {
  return (
    <div
      className="relative my-10 flex items-center gap-4"
      role="separator"
      aria-label={label}
    >
      <div className="h-px flex-1 bg-slate-200" />
      <span className="shrink-0 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 shadow-sm shadow-slate-200/40">
        {label}
      </span>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
