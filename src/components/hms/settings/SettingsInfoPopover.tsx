"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Click-to-open explanation icon for a settings section or group header — same idiom as
 * CheckInFieldInfo (front-desk field tooltips), generalized for section-level use anywhere.
 * Kept in its own client file so the headers that use it can stay server components and
 * receive icon components as props. */
export function SettingsSectionInfo({
  title,
  text,
  className,
}: {
  title: string;
  text: string;
  className?: string;
}) {
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors",
            "hover:bg-slate-100 hover:text-slate-900",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
            className,
          )}
          aria-label={`Explain: ${title}`}
        >
          <CircleHelp className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="max-w-sm text-left text-sm leading-relaxed">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1.5 text-slate-700">{text}</p>
      </PopoverContent>
    </Popover>
  );
}
