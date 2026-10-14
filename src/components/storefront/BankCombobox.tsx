"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Landmark, Search } from "lucide-react";
import { dashInput } from "./dashboard-blocks";

type Bank = { name: string; code: string };

const normalise = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();

/** Banks whose name has every typed word in it; names that start with what was typed come first. */
export function matchBanks(banks: ReadonlyArray<Bank>, query: string): Bank[] {
  const words = normalise(query).split(" ").filter(Boolean);
  if (!words.length) return [];
  const q = words.join(" ");
  return banks
    .map((bank) => ({ bank, name: normalise(bank.name) }))
    .filter(({ name }) => words.every((w) => name.includes(w)))
    .sort((a, b) => Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)) || a.name.localeCompare(b.name))
    .map(({ bank }) => bank);
}

/**
 * A bank picker you type into. The list stays closed until you start typing (or
 * press the down arrow), then narrows with every letter. Arrow keys move, Enter
 * chooses, Escape closes. Follows the ARIA combobox pattern so screen readers
 * announce the highlighted bank and how many banks match.
 */
export default function BankCombobox({
  id,
  banks,
  value,
  onChange,
  loading,
  describedBy,
}: {
  id: string;
  banks: ReadonlyArray<Bank>;
  value: string;
  onChange: (code: string) => void;
  loading?: boolean;
  describedBy?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);

  const selected = banks.find((b) => b.code === value) ?? null;
  const matches = useMemo(() => matchBanks(banks, query), [banks, query]);
  const showList = open && query.trim() !== "";

  // Close when a click goes elsewhere.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  // Keep the highlighted bank in view.
  useEffect(() => {
    if (showList) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, showList]);

  const choose = (bank: Bank) => {
    onChange(bank.code);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (open) e.preventDefault();
      setOpen(false);
      setQuery("");
      return;
    }
    if (e.key === "Tab") {
      setOpen(false);
      setQuery("");
      return;
    }
    if (!showList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (matches[active]) choose(matches[active]);
    }
  };

  // While typing, show what was typed; otherwise the chosen bank.
  const shown = open ? query : (selected?.name ?? "");
  const optionId = (code: string) => `${id}-option-${code}`;

  return (
    <div ref={wrapper} className="relative">
      <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
      <input
        id={id}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        disabled={loading}
        placeholder={loading ? "Loading banks…" : selected ? "Type to change your bank" : "Start typing your bank's name"}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && matches[active] ? optionId(matches[active].code) : undefined}
        aria-describedby={describedBy}
        className={`${dashInput} pl-11`}
        value={shown}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        // Typing replaces the chosen bank's name, so start from an empty search.
        onFocus={(e) => e.currentTarget.select()}
      />
      {selected && !open ? <Check className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-hidden /> : null}

      <p className="sr-only" role="status">
        {showList ? (matches.length ? `${matches.length} ${matches.length === 1 ? "bank matches" : "banks match"}. Use the up and down arrows to choose.` : "No banks match.") : ""}
      </p>

      {showList ? (
        <ul ref={list} id={listId} role="listbox" aria-label="Banks" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length ? (
            matches.map((b, i) => (
              <li
                key={b.code}
                id={optionId(b.code)}
                data-index={i}
                role="option"
                aria-selected={b.code === value}
                // Keep focus in the input so typing carries on working.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(b)}
                onPointerMove={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm ${i === active ? "bg-slate-100" : ""} ${b.code === value ? "font-semibold text-slate-900" : "text-slate-700"}`}
              >
                <Landmark className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                <span className="min-w-0 break-words">{b.name}</span>
              </li>
            ))
          ) : (
            <li className="px-4 py-2.5 text-sm text-slate-500" role="presentation">
              No bank matches &ldquo;{query}&rdquo;. Check the spelling, or try fewer letters.
            </li>
          )}
        </ul>
      ) : null}
    </div>
  );
}
