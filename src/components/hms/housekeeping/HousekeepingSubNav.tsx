"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "board", label: "Board", suffix: "" },
  { key: "my-tasks", label: "My tasks", suffix: "/my-tasks" },
  { key: "assignments", label: "Assignments", suffix: "/assignments" },
  { key: "inspections", label: "Inspections", suffix: "/inspections" },
  { key: "history", label: "History", suffix: "/history" },
  { key: "lost-found", label: "Lost & found", suffix: "/lost-found" },
  { key: "guest-requests", label: "Guest requests", suffix: "/guest-requests" },
  { key: "reports", label: "Reports", suffix: "/reports" },
  { key: "settings", label: "Settings", suffix: "/settings" },
] as const;

/**
 * Top-of-page tab strip so every Housekeeping sub-page is reachable when the
 * sidebar only shows one collapsed "Housekeeping" entry — true for admins/GMs.
 * The "Housekeeping" department role is attendant-tier only (my tasks, lost &
 * found — see housekeeping-rbac.ts) and already gets its own scoped sidebar
 * items, so this renders nothing for them. Mirrors ProcurementSubNav/InventorySubNav.
 */
export function HousekeepingSubNav({ slug, canAccessAllDepartments }: { slug: string; canAccessAllDepartments: boolean }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/housekeeping`;

  if (!canAccessAllDepartments) return null;

  return (
    <nav className="mt-5 mb-6 flex gap-1 overflow-x-auto py-1">
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
