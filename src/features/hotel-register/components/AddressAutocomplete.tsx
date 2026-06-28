"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, MapPin } from "lucide-react";
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import type { LocationAddressOption } from "@/types";

export default function AddressAutocomplete({
  value,
  onChange,
  country,
}: {
  value: string;
  onChange: (value: string) => void;
  country: string;
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
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-amber-500" />
          <input
            value={manualValue}
            onChange={(e) => {
              setManualValue(e.target.value);
              onChange(e.target.value);
            }}
            placeholder="Type full hotel address..."
            className={`${INPUT_CLASS} pl-9 border-amber-300 focus:border-amber-400`}
          />
        </div>
        <div className="flex items-center justify-between mt-1.5">
          <span className="text-xs text-amber-600 font-medium flex items-center gap-1">Manually entered - not geocoded</span>
          <button type="button" onClick={switchToSearch} className="text-xs text-blue-600 hover:underline">
            Try search again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search hotel address..."
          className={`${INPUT_CLASS} pl-9`}
        />
        {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />}
      </div>

      {open && results.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {results.map((r, i) => (
            <button
              key={`${r.display_name}-${i}`}
              type="button"
              onClick={() => selectResult(r)}
              className="w-full text-left px-4 py-3 text-sm text-slate-700 hover:bg-blue-50 transition-colors border-b border-slate-100 last:border-0"
            >
              <span className="font-medium">{r.display_name}</span>
            </button>
          ))}
          <button type="button" onClick={switchToManual} className="w-full text-left px-4 py-3 text-xs text-slate-400 hover:bg-slate-50 transition-colors border-t border-slate-100">
            Can&apos;t find it? Enter address manually
          </button>
        </div>
      )}

      {searching && query.length >= 4 && (
        <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <span className="w-3.5 h-3.5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
          <span className="text-xs text-slate-600">Searching addresses...</span>
        </div>
      )}

      {noResults && !open && query.length >= 4 && (
        <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-slate-500">No results found for &quot;{query}&quot;</span>
          <button type="button" onClick={switchToManual} className="text-xs text-blue-600 font-semibold hover:underline ml-3 whitespace-nowrap">
            Enter manually
          </button>
        </div>
      )}

      {value && !noResults && <p className="text-xs text-green-600 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Address verified</p>}
    </div>
  );
}
