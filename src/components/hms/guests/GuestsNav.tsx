"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Guests" },
  { href: "/segments", label: "Segments" },
  { href: "/duplicates", label: "Duplicates" },
  { href: "/companies", label: "Companies" },
  { href: "/agents", label: "Travel agents" },
  { href: "/loyalty", label: "Loyalty" },
  { href: "/privacy", label: "Privacy" },
] as const;

/** The tabs across the top of every guest screen. */
export function GuestsNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/guests`;
  return (
    <nav aria-label="Guest screens" className="thin-scrollbar -mx-1 overflow-x-auto px-1">
      <ul className="flex min-w-max gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const href = `${base}${t.href}`;
          const active = t.href === "" ? pathname === base || /\/guests\/[0-9a-f-]{36}$/.test(pathname) : pathname.startsWith(href);
          return (
            <li key={t.label}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-block whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active ? "border-blue-600 text-blue-800" : "border-transparent text-slate-700 hover:border-slate-300 hover:text-slate-900"
                }`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
