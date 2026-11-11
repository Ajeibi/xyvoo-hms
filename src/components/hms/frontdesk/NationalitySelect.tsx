"use client";

import { useMemo, useState } from "react";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { ALL_COUNTRIES } from "@/lib/store/countries";

/**
 * Searchable country picker that stores the two-letter ISO code. Pass `value`/`onChange` to control it,
 * or `defaultValue` + `name` to let it live inside a plain form (the code is then in the FormData).
 */
export function NationalitySelect({
  id,
  name,
  value,
  defaultValue = "NG",
  onChange,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
}) {
  const [inner, setInner] = useState((defaultValue || "NG").toUpperCase());
  const current = (value ?? inner).toUpperCase();

  const options = useMemo(() => {
    const list = ALL_COUNTRIES.map((c) => ({ value: c.code, label: `${c.name} (${c.code})` }));
    // A code saved before this picker existed may not be a known country; keep it selectable.
    if (current && !list.some((o) => o.value === current)) list.unshift({ value: current, label: current });
    return list;
  }, [current]);

  return (
    <FrontDeskPopoverSelect
      id={id}
      name={name}
      value={current}
      onChange={(code) => {
        setInner(code);
        onChange?.(code);
      }}
      options={options}
      searchable
      placeholder="Select country…"
    />
  );
}
