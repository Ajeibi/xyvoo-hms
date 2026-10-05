"use client";

import { CircleAlert } from "lucide-react";

/** Small form pieces shared by the store dashboard screens. */

export const dashInput =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue aria-[invalid=true]:border-red-500";

export function DashField({ id, label, hint, optional, children }: { id: string; label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
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
    </div>
  );
}

export function DashAlert({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
      <p>{message}</p>
    </div>
  );
}

export function DashStatus({ message }: { message: string }) {
  return (
    <p role="status" className="text-sm text-emerald-700">
      {message}
    </p>
  );
}

export async function sendJson(url: string, method: "POST" | "PATCH" | "DELETE", body?: object) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
  return data;
}
