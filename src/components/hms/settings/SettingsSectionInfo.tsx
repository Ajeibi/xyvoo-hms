"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** Click-to-open explanation icon for a settings section or group header — same idiom as
 * CheckInFieldInfo (front-desk field tooltips), generalized for section-level use anywhere. */
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
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors",
            "hover:bg-slate-100 hover:text-slate-700",
            "focus-visible:outline-none",
            className,
          )}
          aria-label={`Explain: ${title}`}
        >
          <CircleHelp className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="max-w-sm text-left text-xs leading-relaxed">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1.5 text-slate-600">{text}</p>
      </PopoverContent>
    </Popover>
  );
}

/** Section-level heading (h2 + subtitle + info tooltip) — the standard header for one settings
 * card (e.g. "Hotel Branding", "Smart lock integration"). */
export function SettingsSectionHeader({
  title,
  subtitle,
  info,
  className,
}: {
  title: string;
  subtitle?: string;
  info: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        <SettingsSectionInfo title={title} text={info} />
      </div>
      {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

/** Group-level heading — groups several related section cards together (e.g. "Front Desk &
 * Reservations") with its own explanation of why these belong together. */
export function SettingsGroupHeader({
  title,
  subtitle,
  info,
}: {
  title: string;
  subtitle: string;
  info: string;
}) {
  return (
    <div className="border-b border-slate-200 pb-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <h1 className="text-xl font-bold text-slate-900">{title}</h1>
        <SettingsSectionInfo title={title} text={info} />
      </div>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}
