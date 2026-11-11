"use client";

import { useId, useMemo, useState } from "react";
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
  /** Adds a search box that filters the list as the user types (for long lists such as countries). */
  searchable?: boolean;
  /** Names the trigger when there is no `<label htmlFor>` pointing at it. */
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
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
  searchable = false,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
}: FrontDeskPopoverSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const valueId = useId();

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  const visibleOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase() === q);
  }, [options, query, searchable]);

  const triggerLabel =
    allowEmpty && value === "" ? emptyLabel : selected ? selected.label : placeholder;

  const listEmpty = options.length === 0 && !allowEmpty;

  return (
    <div className="space-y-0">
      {name ? <input type="hidden" name={name} value={value} readOnly /> : null}
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            id={id}
            disabled={disabled || listEmpty}
            aria-labelledby={ariaLabelledBy ? `${ariaLabelledBy} ${valueId}` : undefined}
            aria-describedby={ariaDescribedBy}
            className={cn(FRONT_DESK_PICKER_TRIGGER_CLASS)}
          >
            <span id={valueId} className="min-w-0 truncate text-left">{triggerLabel}</span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className={cn(FRONT_DESK_PICKER_POPOVER_CLASS)} align="start">
          <div className="p-1">
            {searchable ? (
              <input
                type="search"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                aria-label="Search options"
                className="mb-1 h-9 w-full rounded-lg border border-slate-200 px-2 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            ) : null}
            {listEmpty ? (
              <p className="px-2 py-6 text-center text-sm text-slate-500">{emptyStateMessage}</p>
            ) : (
              <>
                {allowEmpty ? (
                  <button
                    type="button"
                    aria-pressed={value === ""}
                    className={cn(
                      "w-full rounded-lg px-2 py-2 text-left text-sm text-slate-800 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                      value === "" && "bg-sky-50 font-medium text-sky-950",
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
                  {searchable && visibleOptions.length === 0 ? (
                    <li className="px-2 py-4 text-center text-sm text-slate-500">No match.</li>
                  ) : null}
                  {visibleOptions.map((opt) => {
                    const isSelected = value === opt.value && !opt.disabled;
                    return (
                      <li key={opt.value}>
                        <button
                          type="button"
                          disabled={opt.disabled}
                          aria-pressed={isSelected}
                          className={cn(
                            "flex w-full flex-col rounded-lg px-2 py-1.5 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                            !opt.disabled && "hover:bg-slate-100",
                            opt.disabled &&
                              "cursor-not-allowed bg-slate-100/80 text-slate-500 hover:bg-slate-100/80",
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
                            <span className="text-xs font-normal leading-snug text-slate-600">{opt.description}</span>
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
