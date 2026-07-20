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
    <nav className="-mx-8 mt-5 mb-6 flex gap-1 overflow-x-auto px-8 py-1">
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
