"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { isEverywhereArea, placeKey } from "@/lib/store/delivery";
import { COUNTRY_REGIONS, regionLabel } from "@/lib/store/regions";
import PlaceSearch from "./onboarding/PlaceSearch";

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

/**
 * Chooses the states and towns something covers (a delivery option, a free
 * delivery rule), from the same lists as shop setup: tick states from the
 * country's list, and find towns by name. Nothing chosen means everywhere.
 */
export default function AreaPicker({
  id,
  countryCode,
  value,
  onChange,
  disabled,
}: {
  id: string;
  countryCode: string;
  value: string[];
  onChange: (areas: string[]) => void;
  disabled?: boolean;
}) {
  const regions = COUNTRY_REGIONS[countryCode]?.regions ?? null;
  const label = regionLabel(countryCode);
  const plural = label === "County" ? "counties" : `${label.toLowerCase()}s`;
  const [searchKey, setSearchKey] = useState(0);
  const [announcement, setAnnouncement] = useState("");

  const has = (area: string) => value.some((v) => placeKey(v) === placeKey(area));
  const isRegion = (area: string) => Boolean(regions?.some((r) => placeKey(r) === placeKey(area)));
  const chosenRegions = regions ? regions.filter(has) : [];
  // Towns, plus states typed in before there was a list to choose from.
  const others = value.filter((v) => !isRegion(v) && !isEverywhereArea(v));

  const toggle = (area: string, on: boolean) => onChange(on ? [...value, area] : value.filter((v) => placeKey(v) !== placeKey(area)));
  const add = (area: string) => {
    if (!area) return;
    if (!has(area)) onChange([...value, area]);
    setAnnouncement(`${area} added.`);
    // A fresh search box for the next one.
    setSearchKey((k) => k + 1);
  };
  const remove = (area: string) => {
    toggle(area, false);
    setAnnouncement(`${area} removed.`);
  };

  const everywhere = value.find(isEverywhereArea);

  return (
    <div className="space-y-4">
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-blue-600"
          checked={Boolean(everywhere)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked ? [...value, "Everywhere"] : value.filter((v) => !isEverywhereArea(v)))}
        />
        <span>
          <span className="font-medium text-slate-800">Deliver anywhere</span>
          <span className="block text-slate-600">Offer this option to every address. Leave it unticked to offer it only in the areas you choose below.</span>
        </span>
      </label>
      {regions ? (
        <fieldset>
          <legend className="text-sm font-medium text-slate-800">{label === "State" ? "States" : `${label}s`}</legend>
          <p id={`${id}-states-hint`} className="mt-0.5 text-xs text-slate-500">
            {chosenRegions.length ? `${chosenRegions.length} chosen.` : `None chosen.`} Tick every {label.toLowerCase()} this covers.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" className={`text-sm font-medium text-blue-700 underline-offset-2 hover:underline ${ring}`} onClick={() => onChange([...others, ...regions, ...(everywhere ? [everywhere] : [])])} disabled={disabled}>
              Choose all {plural}
            </button>
            {chosenRegions.length ? (
              <button
                type="button"
                className={`text-sm font-medium text-blue-700 underline-offset-2 hover:underline ${ring}`}
                onClick={() => onChange([...others, ...(everywhere ? [everywhere] : [])])}
                disabled={disabled}
              >
                Clear {plural}
              </button>
            ) : null}
          </div>
          <div className="mt-2 grid max-h-64 grid-cols-1 gap-x-4 gap-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 md:grid-cols-3">
            {regions.map((r) => (
              <label key={r} className="flex min-h-9 items-center gap-2 text-sm text-slate-800">
                <input type="checkbox" className="h-4 w-4 shrink-0" checked={has(r)} onChange={(e) => toggle(r, e.target.checked)} disabled={disabled} />
                <span className="min-w-0 break-words">{r}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div>
        <label htmlFor={`${id}-search`} className="mb-1 block text-sm font-medium text-slate-800">
          {regions ? "Towns" : `${label}s and towns`} <span className="font-normal text-slate-500">(optional)</span>
        </label>
        <p id={`${id}-search-hint`} className="mb-2 text-xs text-slate-500">
          {regions ? `To cover only part of a ${label.toLowerCase()}, add its towns instead of ticking it.` : "Type a name, then choose it from the list to add it."}
        </p>
        {disabled ? null : (
          <PlaceSearch
            key={searchKey}
            id={`${id}-search`}
            kind={regions ? "city" : "state"}
            country={countryCode}
            value=""
            onChange={add}
            describedBy={`${id}-search-hint`}
            placeholder={regions ? "For example Ikeja" : "Start typing a place"}
          />
        )}
        {others.length ? (
          <ul className="mt-2 flex flex-wrap gap-2" aria-label={regions ? "Towns covered" : "Places covered"}>
            {others.map((area) => (
              <li key={area} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-800">
                {area}
                <button
                  type="button"
                  onClick={() => remove(area)}
                  disabled={disabled}
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-200 ${ring}`}
                  aria-label={`Remove ${area}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </div>
  );
}
