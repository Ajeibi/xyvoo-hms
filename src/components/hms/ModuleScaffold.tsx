import { CircleDashed, Settings } from "lucide-react";
import type { ModuleScaffoldProps } from "@/types";
import { HmsCard, HmsPage, HmsPageHeader } from "./hms-ui";
import type { HmsMeaning } from "./meaning";

export default function ModuleScaffold({
  title,
  subtitle,
  checklist,
  eyebrow,
  meaning = "neutral",
  icon = Settings,
}: ModuleScaffoldProps & {
  /** The department, e.g. "Maintenance". */
  eyebrow?: string;
  meaning?: HmsMeaning;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <HmsPage>
      <HmsPageHeader eyebrow={eyebrow} title={title} description={subtitle} meaning={meaning} />
      <HmsCard
        id="module-checklist"
        title="Configuration checklist"
        description="What this department's settings cover. Each item shows as to do until it's set up."
        icon={icon}
        meaning={meaning}
      >
        <ol className="space-y-2">
          {checklist.map((item, idx) => (
            <li key={item} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <p className="flex items-center gap-3 text-sm text-slate-900">
                <span
                  aria-hidden
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-xs font-semibold text-slate-700"
                >
                  {idx + 1}
                </span>
                {item}
              </p>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                <CircleDashed className="h-3.5 w-3.5" aria-hidden />
                To do
              </span>
            </li>
          ))}
        </ol>
      </HmsCard>
    </HmsPage>
  );
}
