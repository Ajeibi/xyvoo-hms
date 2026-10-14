"use client";

import { useEffect, useRef, useState } from "react";
import { countries } from "countries-list";
import { MapPin } from "lucide-react";
import { INPUT_CLASS } from "@/features/hotel-register/constants";
import type { LocationCityOption } from "@/types";

export default function CityAutocomplete({
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
  const [results, setResults] = useState<LocationCityOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
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

  const countryName =
    countries[country.toUpperCase() as keyof typeof countries]?.name ||
    Object.values(countries).find((c) => c.name.toLowerCase() === country.toLowerCase())?.name ||
    country ||
    "the selected country";

  const search = (q: string) => {
    setQuery(q);
    onChange("");
    setNoResults(false);
    if (timer.current) clearTimeout(timer.current);

    if (q.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const url = `/api/location/search?type=city&q=${encodeURIComponent(q)}&country=${encodeURIComponent(country)}`;
        const res = await fetch(url, { cache: "no-store" });
        const data = (await res.json()) as { results?: LocationCityOption[] };
        const cities = data.results || [];
        setResults(cities);
        setOpen(cities.length > 0);
        setNoResults(cities.length === 0 && q.length >= 2);
      } catch {
        setNoResults(true);
      }
      setLoading(false);
    }, 400);
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" aria-hidden />
        <input
          id={id}
          value={query}
          onChange={(e) => search(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Start typing your city"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${INPUT_CLASS} pl-9`}
        />
        {loading && <div aria-hidden className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-200 border-t-xyvoo-blue-deep rounded-full animate-spin motion-reduce:animate-none" />}
      </div>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          {results.map((city, i) => (
            <button
              key={`${city.name}-${i}`}
              type="button"
              onClick={() => {
                setQuery(city.name);
                onChange(city.name);
                setOpen(false);
                setResults([]);
              }}
              className="w-full text-left px-4 py-3 text-sm text-slate-800 hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none transition-colors border-b border-slate-100 last:border-0"
            >
              <span className="font-medium">{city.name}</span>
              <span className="text-xs text-slate-600 ml-2 truncate">{city.display}</span>
            </button>
          ))}
        </div>
      )}

      {loading && query.length >= 2 && (
        <div role="status" className="mt-1.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <span aria-hidden className="w-3.5 h-3.5 border-2 border-blue-200 border-t-xyvoo-blue-deep rounded-full animate-spin motion-reduce:animate-none" />
          <span className="text-sm text-slate-700">Searching cities...</span>
        </div>
      )}

      {noResults && !open && !loading && query.length >= 2 && <p role="status" className="text-sm text-amber-800 mt-1.5">Must be a recognised city in {countryName}</p>}
    </div>
  );
}
