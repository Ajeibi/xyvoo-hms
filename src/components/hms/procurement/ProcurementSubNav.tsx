"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "dashboard", label: "Dashboard", suffix: "" },
  { key: "requisitions", label: "Requisitions", suffix: "/requisitions" },
  { key: "vendors", label: "Vendors", suffix: "/vendors" },
  { key: "orders", label: "Purchase orders", suffix: "/orders" },
  { key: "receiving", label: "Receiving", suffix: "/receiving" },
  { key: "budgets", label: "Budgets", suffix: "/budgets" },
  { key: "reports", label: "Reports", suffix: "/reports" },
  { key: "settings", label: "Settings", suffix: "/settings" },
] as const;

/**
 * Top-of-page tab strip so every Procurement sub-page is reachable when the
 * sidebar only shows one collapsed "Procurement" entry — true for admins/GMs.
 * Department-scoped Procurement staff already get the full sub-page list in
 * their sidebar (see department-access.ts), so this renders nothing for
 * them — it would just duplicate that nav. Mirrors InventorySubNav.
 */
export function ProcurementSubNav({ slug, canAccessAllDepartments }: { slug: string; canAccessAllDepartments: boolean }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/procurement`;

  if (!canAccessAllDepartments) return null;

  return (
    <nav aria-label="Procurement pages" className="flex gap-2 overflow-x-auto py-1">
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
