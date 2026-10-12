"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";
import { countryName } from "@/lib/store/countries";
import { inputClass } from "./fields";

type Place = { name: string; display: string };

/**
 * A town or region the merchant has to choose from real places, so addresses
 * can be relied on for delivery. Searches once they pause typing (OpenStreetMap
 * needs whole words, so this isn't letter-by-letter autocomplete), then shows
 * the matches to pick from.
 */
export default function PlaceSearch({
  id,
  kind,
  country,
  state,
  value,
  onChange,
  invalid,
  describedBy,
  placeholder,
}: {
  id: string;
  kind: "city" | "state";
  country: string;
  /** Narrows a town search to this state or region. */
  state?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<Place[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "none" | "failed">("idle");
  const timer = useRef<number | null>(null);
  // Only the latest search's answer counts, if an earlier one comes back late.
  const latest = useRef(0);
  const where = kind === "city" && state ? `${state}, ${countryName(country)}` : countryName(country);

  // (The parent remounts this with a new key when the state changes, so the town is found again.)
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const search = (text: string) => {
    setQuery(text);
    onChange("");
    setResults([]);
    if (timer.current) window.clearTimeout(timer.current);
    if (text.trim().length < 2) return setStatus("idle");
    // Show the spinner straight away, not only once the pause before searching is over.
    setStatus("searching");
    const request = ++latest.current;
    timer.current = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type: kind, q: text.trim(), country, ...(state ? { state } : {}) });
        const res = await fetch(`/api/location/search?${params}`, { cache: "no-store" });
        const data = (await res.json()) as { results?: Place[] };
        if (request !== latest.current) return;
        const found = data.results ?? [];
        setResults(found);
        setStatus(found.length ? "idle" : "none");
      } catch {
        if (request === latest.current) setStatus("failed");
      }
    }, 700);
  };

  const choose = (place: Place) => {
    onChange(place.name);
    setQuery(place.name);
    setResults([]);
    setStatus("idle");
  };

  const statusId = `${id}-search-status`;
  return (
    <div>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={id}
          className={inputClass}
          style={{ paddingLeft: "2.5rem", paddingRight: "2.5rem" }}
          value={query}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => search(e.target.value)}
          aria-invalid={invalid || undefined}
          aria-describedby={[describedBy, statusId].filter(Boolean).join(" ")}
        />
        {status === "searching" ? (
          <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-xyvoo-teal-product-hover motion-reduce:animate-none" aria-hidden />
        ) : value ? (
          <Check className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" aria-label="Found" />
        ) : null}
      </div>

      {results.length ? (
        <ul className="mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Matching places">
          {results.map((place) => (
            <li key={place.display} className="border-b border-slate-100 last:border-0">
              <button type="button" onClick={() => choose(place)} className="w-full px-4 py-2.5 text-left text-sm hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
                <span className="font-medium text-slate-900">{place.name}</span>
                <span className="block truncate text-xs text-slate-500">{place.display}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <p id={statusId} role="status" className={`mt-1 text-xs ${status === "none" || status === "failed" ? "text-amber-700" : "text-slate-500"}`}>
        {status === "searching"
          ? "Searching…"
          : status === "none"
            ? `We couldn't find "${query.trim()}" in ${where}. Check the spelling, or try the nearest larger town.`
            : status === "failed"
              ? "We couldn't search just now. Please try again."
              : results.length
                ? `Choose from the ${results.length} ${results.length === 1 ? "match" : "matches"} below.`
                : value
                  ? ""
                  : "Type the full name, then choose it from the list."}
      </p>
    </div>
  );
}
