"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "pos", label: "POS", path: (slug: string) => `/hms/${slug}/restaurant-bar` },
  { key: "tables", label: "Tables", path: (slug: string) => `/hms/${slug}/restaurant-bar/tables` },
  { key: "orders", label: "Open orders", path: (slug: string) => `/hms/${slug}/restaurant-bar/orders` },
  {
    key: "history",
    label: "Order history",
    path: (slug: string) => `/hms/${slug}/restaurant-bar/history`,
  },
  { key: "settings", label: "Settings", path: (slug: string) => `/hms/${slug}/restaurant-bar/settings` },
] as const;

function isActive(pathname: string, href: string, key: string) {
  if (key === "pos") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FbDepartmentNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-200 bg-white px-6">
      <div className="flex w-full gap-1 overflow-x-auto py-2">
        {TABS.map((tab) => {
          const href = tab.path(slug);
          const active = isActive(pathname, href, tab.key);
          return (
            <Link
              key={tab.key}
              href={href}
              className={cn(
                "shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
