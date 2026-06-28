"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { FRONT_DESK_PICKER_POPOVER_CLASS, FRONT_DESK_PICKER_TRIGGER_CLASS } from "@/components/hms/frontdesk/front-desk-picker-ui";
import { cn } from "@/lib/utils";

export type FrontDeskPopoverSelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type FrontDeskPopoverSelectProps = {
  id?: string;
  /** Renders a hidden input so the value is included in `FormData` on submit. */
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: FrontDeskPopoverSelectOption[];
  /** When true, shows a first row that sets value to `""`. */
  allowEmpty?: boolean;
  emptyLabel?: string;
  /** Shown on the trigger when nothing matches (e.g. no selection yet). */
  placeholder?: string;
  disabled?: boolean;
  emptyStateMessage?: string;
};

export function FrontDeskPopoverSelect({
  id,
  name,
  value,
  onChange,
  options,
  allowEmpty = false,
  emptyLabel = "—",
  placeholder = "Select…",
  disabled = false,
  emptyStateMessage = "No options available.",
}: FrontDeskPopoverSelectProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const triggerLabel =
    allowEmpty && value === "" ? emptyLabel : selected ? selected.label : placeholder;

  const listEmpty = options.length === 0 && !allowEmpty;

  return (
    <div className="space-y-0">
      {name ? <input type="hidden" name={name} value={value} readOnly /> : null}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            disabled={disabled || listEmpty}
            className={cn(FRONT_DESK_PICKER_TRIGGER_CLASS)}
          >
            <span className="min-w-0 truncate text-left">{triggerLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn(FRONT_DESK_PICKER_POPOVER_CLASS)} align="start">
          <div className="p-1">
            {listEmpty ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">{emptyStateMessage}</p>
            ) : (
              <>
                {allowEmpty ? (
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-lg px-2 py-2 text-left text-sm text-slate-800 hover:bg-slate-100",
                      value === "" && "bg-slate-50 font-medium",
                    )}
                    onClick={() => {
                      onChange("");
                      setOpen(false);
                    }}
                  >
                    {emptyLabel}
                  </button>
                ) : null}
                <ul className={cn("space-y-0.5", allowEmpty && options.length > 0 && "mt-0.5")}>
                  {options.map((opt) => {
                    const isSelected = value === opt.value && !opt.disabled;
                    return (
                      <li key={opt.value}>
                        <button
                          type="button"
                          disabled={opt.disabled}
                          className={cn(
                            "flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-sm transition-colors",
                            !opt.disabled && "hover:bg-slate-100",
                            opt.disabled &&
                              "cursor-not-allowed bg-slate-100/80 text-slate-400 hover:bg-slate-100/80",
                            isSelected && "bg-sky-50 font-medium text-sky-950 hover:bg-sky-50",
                          )}
                          onClick={() => {
                            if (opt.disabled) return;
                            onChange(opt.value);
                            setOpen(false);
                          }}
                        >
                          <span className="font-medium leading-snug">{opt.label}</span>
                          {opt.description ? (
                            <span className="text-xs font-normal leading-snug text-slate-500">{opt.description}</span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
