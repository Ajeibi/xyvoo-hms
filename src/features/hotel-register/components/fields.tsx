"use client";

import { Check, CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Form pieces shared by hotel sign-in and registration, in the storefront's style with the hotel blue. */

export const PRIMARY_BUTTON_CLASS =
  "flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-xyvoo-blue-deep bg-xyvoo-blue-deep py-3 font-semibold text-white transition-transform duration-300 ease-in-out hover:rotate-[5deg] hover:bg-white hover:text-xyvoo-blue-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:rotate-0 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:rotate-0 disabled:hover:bg-xyvoo-blue-deep disabled:hover:text-white";

export const LINK_CLASS = "font-semibold text-black underline underline-offset-2 hover:text-xyvoo-blue-deep";

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
  hint?: React.ReactNode;
  optional?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className={cn("mb-1.5 block text-sm font-medium", error ? "text-rose-700" : "text-black")}>
        {label} {optional ? <span className="font-normal text-slate-600">(optional)</span> : null}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-sm font-semibold text-rose-700">
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-slate-600">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria-describedby for a Field's input, pointing at whichever of hint and error are shown. */
export function describedBy(id: string, { hint, error }: { hint?: boolean; error?: string }) {
  return [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
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

export function Spinner() {
  return (
    <span
      aria-hidden
      className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin motion-reduce:animate-none"
    />
  );
}

/** The rules the server checks in isStrongPassword, shown live as the password is typed. */
export function passwordCriteria(password: string) {
  return [
    { label: "At least 8 characters long", met: password.length >= 8 },
    { label: "Must have a capital letter", met: /[A-Z]/.test(password) },
    { label: "Must have a number", met: /[0-9]/.test(password) },
    { label: "Must have a special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function PasswordStrength({ id, password }: { id: string; password: string }) {
  const criteria = passwordCriteria(password);
  const metCount = criteria.filter((c) => c.met).length;
  const total = criteria.length;
  const strong = metCount === total;
  const tone = strong ? "emerald" : metCount >= 2 ? "amber" : "rose";

  return (
    <div id={id} className="mt-2.5 space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-medium text-slate-700">Password strength</span>
        <span
          className={cn(
            "font-semibold",
            tone === "emerald" ? "text-emerald-700" : tone === "amber" ? "text-amber-800" : "text-rose-700",
          )}
        >
          {strong ? "Strong" : metCount >= 2 ? "Moderate" : "Weak"}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-1.5" aria-hidden>
        {criteria.map((c, i) => (
          <div
            key={c.label}
            className={cn(
              "h-1.5 rounded-full transition-colors duration-300",
              metCount > i
                ? tone === "emerald"
                  ? "bg-emerald-500"
                  : tone === "amber"
                    ? "bg-amber-500"
                    : "bg-rose-500"
                : "bg-slate-200",
            )}
          />
        ))}
      </div>

      <ul className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
        {criteria.map((c) => (
          <li key={c.label} className={cn("flex items-center gap-2", c.met ? "font-medium text-emerald-900" : "text-slate-600")}>
            <span
              aria-hidden
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors duration-200",
                c.met ? "bg-emerald-500 text-white" : "border border-slate-300 bg-white text-transparent",
              )}
            >
              <Check className="h-2.5 w-2.5 stroke-[3]" />
            </span>
            <span>
              {c.label}
              <span className="sr-only">{c.met ? " (done)" : " (not yet)"}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
