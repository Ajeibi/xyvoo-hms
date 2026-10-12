import { countries } from "country-flag-icons";

/** Every country, by ISO code, with its English name, for the "somewhere else" country picker. */
const names = new Intl.DisplayNames(["en-GB"], { type: "region" });

export const ALL_COUNTRIES: ReadonlyArray<{ code: string; name: string }> = countries
  .filter((code) => /^[A-Z]{2}$/.test(code))
  .map((code) => ({ code, name: names.of(code) ?? code }))
  // Codes Intl doesn't know come back unchanged; they aren't real countries to offer.
  .filter((c) => c.name !== c.code)
  .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));

const CODES = new Set(ALL_COUNTRIES.map((c) => c.code));

export const isCountryCode = (value: string) => CODES.has(value);

export const countryName = (code: string) => ALL_COUNTRIES.find((c) => c.code === code)?.name ?? code;

/** Flags are served from public/flags (copied from country-flag-icons), so only the ones shown are downloaded. */
export const flagUrl = (code: string) => `/flags/${code}.svg`;
