"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ChefHat, History, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "live", label: "Live orders", icon: ChefHat, path: (slug: string) => `/hms/${slug}/kitchen`, exact: true },
  {
    key: "menu",
    label: "Menu",
    icon: BookOpen,
    path: (slug: string) => `/hms/${slug}/kitchen/menu`,
    exact: false,
  },
  {
    key: "history",
    label: "Order history",
    icon: History,
    path: (slug: string) => `/hms/${slug}/kitchen/history`,
    exact: false,
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    path: (slug: string) => `/hms/${slug}/kitchen/settings`,
    exact: false,
  },
] as const;

export function KitchenDepartmentNav({ slug }: { slug: string }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Kitchen sections" className="border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex w-full gap-2 overflow-x-auto py-3">
        {TABS.map((tab) => {
          const href = tab.path(slug);
          const active = tab.exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
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
