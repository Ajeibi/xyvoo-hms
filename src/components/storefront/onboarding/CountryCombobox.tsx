"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { countryName, flagUrl } from "@/lib/store/countries";
import { inputClass } from "./fields";

type Country = { code: string; name: string };

function Flag({ code, className = "" }: { code: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny local SVG
    <img src={flagUrl(code)} alt="" width={24} height={16} loading="lazy" className={`h-4 w-6 shrink-0 rounded-sm object-cover ring-1 ring-slate-200 ${className}`} />
  );
}

/**
 * A country picker with flags. Type to narrow the list; arrow keys move, Enter
 * chooses, Escape closes. Follows the ARIA combobox pattern so screen readers
 * announce the highlighted country.
 */
export default function CountryCombobox({
  id,
  countries,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id: string;
  countries: ReadonlyArray<Country>;
  value: string;
  onChange: (code: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q) : countries;
  }, [countries, query]);

  // Close when focus or a click goes elsewhere.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep the highlighted country in view.
  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openList = () => {
    setQuery("");
    const selected = countries.findIndex((c) => c.code === value);
    setActive(selected >= 0 ? selected : 0);
    setOpen(true);
  };
  const choose = (country: Country) => {
    onChange(country.code);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) choose(matches[active]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const shown = open ? query : value ? countryName(value) : "";
  const optionId = (code: string) => `${id}-option-${code}`;

  return (
    <div ref={wrapper} className="relative">
      {value && !open ? <Flag code={value} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2" /> : null}
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        placeholder={open ? "Type to search" : "Choose your country"}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? optionId(matches[active].code) : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${inputClass} pr-10`}
        style={value && !open ? { paddingLeft: "3.25rem" } : undefined}
        value={shown}
        onFocus={() => !open && openList()}
        onClick={() => !open && openList()}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />

      {open ? (
        <ul
          ref={list}
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {matches.length ? (
            matches.map((c, i) => (
              <li
                key={c.code}
                id={optionId(c.code)}
                data-index={i}
                role="option"
                aria-selected={c.code === value}
                // Keep focus in the input so typing carries on working.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(c)}
                onPointerMove={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${i === active ? "bg-slate-100" : ""} ${c.code === value ? "font-semibold text-slate-900" : "text-slate-700"}`}
              >
                <Flag code={c.code} />
                {c.name}
              </li>
            ))
          ) : (
            <li className="px-4 py-2.5 text-sm text-slate-500" role="presentation">
              No country matches &ldquo;{query}&rdquo;
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
