"use client";

import { useState } from "react";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { Input } from "@/components/ui/input";
import { GUEST_TITLES, GUEST_TITLE_MAX_LENGTH, matchKnownGuestTitle } from "@/lib/hms/guest-title";

const OTHER = "__other";

/**
 * Title picker. Choosing "Other" shows a text box, and what is typed there is the title that gets saved.
 * `value` is the title as stored ("Mr", or any custom text); `onChange` receives the same.
 */
export function GuestTitleField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string | null | undefined;
  onChange: (title: string | null) => void;
}) {
  const current = value?.trim() ?? "";
  const known = matchKnownGuestTitle(current);
  // "Other" stays picked while its box is still empty, so the box doesn't vanish as soon as it appears.
  const [otherPicked, setOtherPicked] = useState(Boolean(current) && !known);
  const inOther = otherPicked || (Boolean(current) && !known);
  const selectValue = inOther ? OTHER : (known ?? "");
  const customText = current.toLowerCase() === "other" ? "" : current;

  return (
    <div className="space-y-2">
      <FrontDeskPopoverSelect
        id={id}
        value={selectValue}
        onChange={(v) => {
          if (v === OTHER) {
            setOtherPicked(true);
            onChange(null);
            return;
          }
          setOtherPicked(false);
          onChange(v || null);
        }}
        allowEmpty
        emptyLabel="—"
        placeholder="Select title…"
        options={[
          ...GUEST_TITLES.map((t) => ({ value: t, label: t })),
          { value: OTHER, label: "Other" },
        ]}
      />
      {inOther ? (
        <Input
          id={`${id}-other`}
          aria-label="Custom title"
          placeholder="Type the title, e.g. Prof"
          maxLength={GUEST_TITLE_MAX_LENGTH}
          value={customText}
          onChange={(e) => onChange(e.target.value || null)}
          className="h-10 rounded-xl"
        />
      ) : null}
    </div>
  );
}
