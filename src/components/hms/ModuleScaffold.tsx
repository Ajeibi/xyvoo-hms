import type { ModuleScaffoldProps } from "@/types";

export default function ModuleScaffold({ title, subtitle, checklist }: ModuleScaffoldProps) {
  return (
    <div className="px-8 py-8 max-w-4xl">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>

      <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Configuration Checklist</h2>
        <div className="space-y-2">
          {checklist.map((item, idx) => (
            <div key={item} className="p-3 rounded-lg border border-slate-200 flex items-center justify-between">
              <p className="text-sm text-slate-800">
                {idx + 1}. {item}
              </p>
              <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-1 rounded-full">Pending</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
