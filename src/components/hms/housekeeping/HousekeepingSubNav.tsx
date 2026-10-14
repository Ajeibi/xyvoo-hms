"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BellRing,
  ClipboardCheck,
  History,
  LayoutGrid,
  ListChecks,
  PackageSearch,
  Settings,
  Users,
} from "lucide-react";

const TABS = [
  { key: "board", label: "Board", suffix: "", icon: LayoutGrid },
  { key: "my-tasks", label: "My tasks", suffix: "/my-tasks", icon: ListChecks },
  { key: "assignments", label: "Assignments", suffix: "/assignments", icon: Users },
  { key: "inspections", label: "Inspections", suffix: "/inspections", icon: ClipboardCheck },
  { key: "history", label: "History", suffix: "/history", icon: History },
  { key: "lost-found", label: "Lost & found", suffix: "/lost-found", icon: PackageSearch },
  { key: "guest-requests", label: "Guest requests", suffix: "/guest-requests", icon: BellRing },
  { key: "reports", label: "Reports", suffix: "/reports", icon: BarChart3 },
  { key: "settings", label: "Settings", suffix: "/settings", icon: Settings },
] as const;

/**
 * Top-of-page tab strip so every Housekeeping sub-page is reachable when the
 * sidebar only shows one collapsed "Housekeeping" entry: true for admins/GMs.
 * The "Housekeeping" department role is attendant-tier only (my tasks, lost &
 * found; see housekeeping-rbac.ts) and already gets its own scoped sidebar
 * items, so this renders nothing for them. Mirrors ProcurementSubNav/InventorySubNav.
 */
export function HousekeepingSubNav({ slug, canAccessAllDepartments }: { slug: string; canAccessAllDepartments: boolean }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/housekeeping`;

  if (!canAccessAllDepartments) return null;

  return (
    <nav aria-label="Housekeeping sections" className="flex gap-2 overflow-x-auto py-1">
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = pathname === href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
              active
                ? "border-violet-600 bg-violet-50 text-violet-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <Icon className={`h-4 w-4 ${active ? "text-violet-600" : "text-slate-500"}`} aria-hidden />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
