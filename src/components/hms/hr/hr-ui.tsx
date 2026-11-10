"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";

/** Calls an HR route and returns the error text (or null on success) plus any data. */
export async function callHr<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
): Promise<{ error: string | null; data: T | null }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: json.error ?? "Something went wrong. Try again.", data: null };
    return { error: null, data: json };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again.", data: null };
  }
}

const TABS = [
  { label: "Dashboard", suffix: "" },
  { label: "Staff", suffix: "/staff" },
  { label: "Rota", suffix: "/rota" },
  { label: "Time", suffix: "/time" },
  { label: "Leave", suffix: "/leave" },
  { label: "Payroll", suffix: "/payroll" },
  { label: "Settings", suffix: "/settings" },
];

export function HrSubNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/hr`;
  return (
    <nav aria-label="HR pages" className="-mx-3 flex gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = tab.suffix === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? "border-violet-600 bg-violet-50 text-violet-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Shown in place of pay and personal details to anyone the database doesn't let see them. */
export function PrivateLocked({ what = "pay and personal details" }: { what?: string }) {
  return (
    <div role="note" className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <p>
        Only the hotel&apos;s owner and the people they choose can see {what}. The owner can give you access in HR settings.
      </p>
    </div>
  );
}

export const checkboxClass = "h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500";
