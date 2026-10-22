"use client";

import "react-phone-number-input/style.css";
import { useMemo } from "react";
import PhoneInput, { getCountries, parsePhoneNumber, type Country, type Labels } from "react-phone-number-input";

/** "International" in the shop languages the browser can't name for us. */
const INTERNATIONAL: Record<string, string> = { sw: "Kimataifa", fr: "International", pt: "Internacional" };

/** Country names in the shopper's language, from the browser's own translations. English uses the picker's own. */
function countryLabels(lang: string | undefined): Labels | undefined {
  if (!lang || lang === "en" || typeof Intl.DisplayNames !== "function") return undefined;
  try {
    const names = new Intl.DisplayNames([lang], { type: "region" });
    const labels: Labels = { ZZ: INTERNATIONAL[lang] ?? "International" };
    for (const code of getCountries()) labels[code] = names.of(code) ?? code;
    return labels;
  } catch {
    return undefined;
  }
}

/** A number saved without its country code (e.g. "0803…") becomes "+234803…" so the input can show it. */
export function toInternational(value: string, countryCode: string) {
  if (!value || value.startsWith("+")) return value;
  try {
    return parsePhoneNumber(value, countryCode as Country)?.number ?? value;
  } catch {
    return value;
  }
}

/** A phone number with a country picker and dialling code, the same as on sign-up. */
export default function PhoneField({
  id,
  value,
  onChange,
  countryCode,
  invalid,
  describedBy,
  lang,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  countryCode: string;
  invalid?: boolean;
  describedBy?: string;
  /** The shopper's language, for the country names (the shop's checkout). */
  lang?: string;
}) {
  const labels = useMemo(() => countryLabels(lang), [lang]);
  return (
    <PhoneInput
      labels={labels}
      international
      defaultCountry={countryCode as Country}
      value={value || undefined}
      onChange={(v) => onChange(v || "")}
      placeholder="803 123 4567"
      numberInputProps={{ id, "aria-invalid": invalid || undefined, "aria-describedby": describedBy }}
      className={`storefront-phone-input ${invalid ? "has-error" : ""}`}
      style={{ ["--PhoneInputCountryFlag-height" as string]: "1.2em" }}
    />
  );
}
