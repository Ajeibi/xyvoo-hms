"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin } from "lucide-react";
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import type { LocationAddressOption } from "@/types";
import { cn } from "@/lib/utils";

export default function AddressAutocomplete({
  id,
  value,
  onChange,
  country,
  invalid,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  country: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState<LocationAddressOption[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [noResults, setNoResults] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const search = (q: string) => {
    setQuery(q);
    onChange("");
    setNoResults(false);
    if (timer.current) clearTimeout(timer.current);
    if (q.length < 4) {
      setResults([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const url = `/api/location/search?type=address&q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = (await res.json()) as { results?: LocationAddressOption[] };
        const rows = data.results || [];
        setResults(rows);
        setOpen(rows.length > 0);
        setNoResults(rows.length === 0);
      } catch {
        setNoResults(true);
      }
      setSearching(false);
    }, 500);
  };

  const selectResult = (r: LocationAddressOption) => {
    setQuery(r.display_name);
    onChange(r.display_name);
    setOpen(false);
    setResults([]);
    setNoResults(false);
  };

  const switchToManual = () => {
    setManual(true);
    setOpen(false);
    setResults([]);
    setNoResults(false);
    setQuery("");
    onChange("");
  };

  const switchToSearch = () => {
    setManual(false);
    setManualValue("");
    onChange("");
  };

  if (manual) {
    return (
      <div>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-700" aria-hidden />
          <input
            id={id}
            value={manualValue}
            onChange={(e) => {
              setManualValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="Type the full hotel address"
            autoComplete="street-address"
            aria-invalid={invalid || undefined}
            aria-describedby={[describedBy, id ? `${id}-manual-note` : null].filter(Boolean).join(" ") || undefined}
            className={cn(INPUT_CLASS, "pl-9", !invalid && "border-amber-400")}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 mt-1.5">
          <span id={id ? `${id}-manual-note` : undefined} className="text-sm text-amber-800 font-medium">
            Entered by hand, so it won&rsquo;t be checked on the map.
          </span>
          <button type="button" onClick={switchToSearch} className="inline-flex min-h-11 items-center text-sm font-semibold text-xyvoo-blue-deep hover:underline">
            Try search again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden />
        <input
          id={id}
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Start typing your hotel's address"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${INPUT_CLASS} pl-9`}
        />
        {searching && <div aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-200 border-t-xyvoo-blue-deep rounded-full animate-spin motion-reduce:animate-none" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={`${r.display_name}-${i}`}
              type="button"
              onClick={() => selectResult(r)}
              className="w-full text-left px-4 py-3 text-sm text-slate-800 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none transition-colors border-b border-slate-100 last:border-0"
            >
              <span className="font-medium">{r.display_name}</span>
            </button>
          ))}
          <button type="button" onClick={switchToManual} className="w-full text-left px-4 py-3 text-sm font-medium text-xyvoo-blue-deep hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none transition-colors border-t border-slate-100">
            Can&rsquo;t find it? Enter the address yourself
          </button>
        </div>
      )}

      {searching && query.length >= 4 && (
        <div role="status" className="mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <span aria-hidden className="w-3.5 h-3.5 border-2 border-blue-200 border-t-xyvoo-blue-deep rounded-full animate-spin motion-reduce:animate-none" />
          <span className="text-sm text-slate-700">Searching addresses...</span>
        </div>
      )}

      {noResults && !open && query.length >= 4 && (
        <div role="status" className="mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex flex-wrap items-center justify-between gap-x-3">
          <span className="text-sm text-slate-700">No results found for &ldquo;{query}&rdquo;</span>
          <button type="button" onClick={switchToManual} className="inline-flex min-h-11 items-center text-sm text-xyvoo-blue-deep font-semibold hover:underline whitespace-nowrap">
            Enter it yourself
          </button>
        </div>
      )}

      {value && !noResults && <p className="text-sm font-medium text-green-700 mt-1.5 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" aria-hidden />Address verified</p>}
    </div>
  );
}
