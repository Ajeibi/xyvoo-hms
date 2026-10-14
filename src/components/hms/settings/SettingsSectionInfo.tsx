"use client";

import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";
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
        <h2 className="font-heading text-base font-semibold text-slate-900">{title}</h2>
        <SettingsSectionInfo title={title} text={info} />
      </div>
      {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
    </div>
  );
}

/** Group-level heading — groups several related section cards together (e.g. "Front Desk &
 * Reservations") with its own explanation of why these belong together. */
export function SettingsGroupHeader({
  id,
  title,
  subtitle,
  info,
  icon: Icon,
  meaning = "neutral",
}: {
  /** Used for the heading's id, so the group's <section> can be labelled by it. */
  id?: string;
  title: string;
  subtitle: string;
  info: string;
  icon?: React.ComponentType<{ className?: string }>;
  meaning?: HmsMeaning;
}) {
  const tone = HMS_MEANING[meaning];
  return (
    <div className="flex items-start gap-3 border-b border-slate-200 pb-4">
      {Icon ? (
        <span aria-hidden className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone.tint} ${tone.icon}`}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 id={id} className="font-heading text-xl font-bold text-slate-900">
            {title}
          </h2>
          <SettingsSectionInfo title={title} text={info} />
        </div>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>
      </div>
    </div>
  );
}
