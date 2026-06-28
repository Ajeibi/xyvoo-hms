"use client";

import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type CheckInFieldInfoProps = {
  /** Short title in the popover and for `aria-label`. */
  label: string;
  /** Explanation for front-desk staff. */
  text: string;
  className?: string;
};

/** Click the icon to open an explanation (popover). */
export function CheckInFieldInfo({ label, text, className }: CheckInFieldInfoProps) {
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors",
            "hover:bg-slate-100 hover:text-slate-700",
            "focus-visible:outline-none",
            className,
          )}
          aria-label={`Explain: ${label}`}
        >
          <CircleHelp className="size-4" strokeWidth={2} aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="text-xs leading-relaxed">
        <p className="font-semibold text-slate-900">{label}</p>
        <p className="mt-1.5 text-slate-600">{text}</p>
      </PopoverContent>
    </Popover>
  );
}

type CheckInFieldLabelRowProps = {
  htmlFor: string;
  required?: boolean;
  helpTitle: string;
  helpText: string;
  children: ReactNode;
};

/** Label + optional asterisk + info trigger on one row. */
export function CheckInFieldLabelRow({
  htmlFor,
  required,
  helpTitle,
  helpText,
  children,
}: CheckInFieldLabelRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <label htmlFor={htmlFor} className="text-sm font-medium text-slate-700">
        {children}
        {required ? <span className="text-rose-600"> *</span> : null}
      </label>
      <CheckInFieldInfo label={helpTitle} text={helpText} />
    </div>
  );
}
