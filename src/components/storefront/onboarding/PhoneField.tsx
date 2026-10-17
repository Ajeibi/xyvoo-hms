"use client";

import "react-phone-number-input/style.css";
import PhoneInput, { parsePhoneNumber, type Country } from "react-phone-number-input";

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
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  countryCode: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  return (
    <PhoneInput
      international
      // The +234 (or other code) stays put: it changes only with the country picker, so clearing
      // the field and typing a local number still gives a full international number.
      countryCallingCodeEditable={false}
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
