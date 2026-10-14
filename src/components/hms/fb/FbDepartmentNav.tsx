"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, History, LayoutGrid, Settings, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "pos", label: "POS", icon: ShoppingBasket, path: (slug: string) => `/hms/${slug}/restaurant-bar` },
  { key: "tables", label: "Tables", icon: LayoutGrid, path: (slug: string) => `/hms/${slug}/restaurant-bar/tables` },
  { key: "orders", label: "Open orders", icon: ClipboardList, path: (slug: string) => `/hms/${slug}/restaurant-bar/orders` },
  {
    key: "history",
    label: "Order history",
    icon: History,
    path: (slug: string) => `/hms/${slug}/restaurant-bar/history`,
  },
  { key: "settings", label: "Settings", icon: Settings, path: (slug: string) => `/hms/${slug}/restaurant-bar/settings` },
] as const;

function isActive(pathname: string, href: string, key: string) {
  if (key === "pos") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function FbDepartmentNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Restaurant and bar sections" className="border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex w-full gap-2 overflow-x-auto py-3">
        {TABS.map((tab) => {
          const href = tab.path(slug);
          const active = isActive(pathname, href, tab.key);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.key}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1",
                active
                  ? "border-orange-600 bg-orange-50 text-orange-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-slate-50 hover:text-slate-900",
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-orange-600" : "text-slate-500")} aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
