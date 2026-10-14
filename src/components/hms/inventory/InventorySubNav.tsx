"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "dashboard", label: "Dashboard", suffix: "" },
  { key: "stock", label: "Stock levels", suffix: "/stock" },
  { key: "receiving", label: "Receiving", suffix: "/receiving" },
  { key: "requisitions", label: "Requisitions", suffix: "/requisitions" },
  { key: "transfers", label: "Transfers", suffix: "/transfers" },
  { key: "counts", label: "Stock counts", suffix: "/counts" },
  { key: "waste", label: "Waste & spoilage", suffix: "/waste" },
  { key: "reports", label: "Reports", suffix: "/reports" },
  { key: "settings", label: "Settings", suffix: "/settings" },
] as const;

/**
 * Top-of-page tab strip so every Inventory sub-page is reachable when the
 * sidebar only shows one collapsed "Inventory" entry — true for admins/GMs.
 * Department-scoped Store/Inventory staff already get the full sub-page list
 * in their sidebar (see department-access.ts), so this renders nothing for
 * them — it would just duplicate that nav.
 */
export function InventorySubNav({ slug, canAccessAllDepartments }: { slug: string; canAccessAllDepartments: boolean }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/inventory`;

  if (!canAccessAllDepartments) return null;

  return (
    <nav aria-label="Inventory pages" className="flex gap-2 overflow-x-auto py-1">
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.key}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? "border-teal-600 bg-teal-50 text-teal-900"
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
