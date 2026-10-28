"use client";

import { cn } from "@/lib/utils";
import { hmsInput } from "@/components/hms/hms-ui";

/** Quick reasons as buttons, plus a box for anything else. */
export function ReasonPicker({
  idPrefix,
  reasons,
  value,
  required,
  disabled,
  onChange,
}: {
  idPrefix: string;
  reasons: readonly string[];
  value: string;
  required: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p id={`${idPrefix}-reason-label`} className="mb-1.5 text-sm font-medium text-slate-800">
        Reason {required ? null : <span className="font-normal text-slate-600">(optional)</span>}
      </p>
      <div role="group" aria-labelledby={`${idPrefix}-reason-label`} className="mb-2 flex flex-wrap gap-1.5">
        {reasons.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={value === r}
            disabled={disabled}
            onClick={() => onChange(r)}
            className={cn(
              "min-h-9 rounded-lg border px-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              value === r ? "border-blue-600 bg-blue-50 text-blue-900" : "border-slate-200 text-slate-700 hover:bg-slate-50",
            )}
          >
            {r}
          </button>
        ))}
      </div>
      <label htmlFor={`${idPrefix}-reason`} className="sr-only">
        Reason in your own words
      </label>
      <input
        id={`${idPrefix}-reason`}
        value={value}
        maxLength={200}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Or type a reason"
        className={hmsInput}
      />
    </div>
  );
}

/** The hotel's manager PIN. Managers and owners can leave it blank. */
export function ManagerPinField({
  idPrefix,
  value,
  disabled,
  onChange,
}: {
  idPrefix: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label htmlFor={`${idPrefix}-manager-pin`} className="mb-1 block text-sm font-medium text-slate-800">
        Manager PIN
      </label>
      <input
        id={`${idPrefix}-manager-pin`}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={20}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${idPrefix}-manager-pin-hint`}
        className={cn(hmsInput, "max-w-40")}
      />
      <p id={`${idPrefix}-manager-pin-hint`} className="mt-1 text-xs text-slate-500">
        Not needed if you are signed in as a manager or owner.
      </p>
    </div>
  );
}
