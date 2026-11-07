"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/calendar", label: "Rates calendar" },
  { href: "/plans", label: "Rate plans" },
  { href: "/prices", label: "Prices" },
  { href: "/restrictions", label: "Restrictions" },
  { href: "/suggestions", label: "Suggestions" },
  { href: "/history", label: "History" },
];

export function RevenueTabs({ slug }: { slug: string }) {
  const pathname = usePathname() ?? "";
  const base = `/hms/${slug}/revenue`;
  return (
    <nav aria-label="Revenue sections" className="-mx-3 overflow-x-auto px-2 [scrollbar-width:none] sm:-mx-1 sm:px-0 [&::-webkit-scrollbar]:hidden">
      <ul className="flex min-w-max gap-1 border-b border-slate-200 px-1">
        {TABS.map((t) => {
          const href = `${base}${t.href}`;
          const active = t.href === "" ? pathname === base : pathname.startsWith(href);
          return (
            <li key={t.href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-block border-b-2 px-3 py-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active ? "border-xyvoo-blue-deep text-slate-900" : "border-transparent text-slate-600 hover:text-slate-900"
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
