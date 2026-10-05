"use client";

import { CircleAlert } from "lucide-react";

/** Form pieces shared by the onboarding wizard steps. */

export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover aria-[invalid=true]:border-red-500";

export function Field({
  id,
  label,
  hint,
  optional,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-800">
        {label} {optional ? <span className="font-normal text-slate-500">(optional)</span> : null}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria-describedby for a Field's input, pointing at whichever of hint and error are shown. */
export function describedBy(id: string, { hint, error }: { hint?: boolean; error?: string }) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

export function StepActions({ busy, backHref, submitLabel = "Save and continue" }: { busy: boolean; backHref: string | null; submitLabel?: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
      {backHref ? (
        <a href={backHref} className="text-center text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline">
          Back
        </a>
      ) : (
        <span />
      )}
      <button
        type="submit"
        disabled={busy}
        className="rounded-xl bg-xyvoo-teal-product-hover px-6 py-3 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}
