"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "dashboard", label: "Dashboard", suffix: "" },
  { key: "chart", label: "Chart of accounts", suffix: "/chart" },
  { key: "journal", label: "Journal entries", suffix: "/journal" },
  { key: "trial-balance", label: "Trial balance", suffix: "/trial-balance" },
  { key: "bills", label: "Vendor bills", suffix: "/bills" },
  { key: "ap-aging", label: "AP aging", suffix: "/ap-aging" },
  { key: "invoices", label: "Customer invoices", suffix: "/invoices" },
  { key: "ar-aging", label: "AR aging", suffix: "/ar-aging" },
  { key: "night-audit", label: "Night audit", suffix: "/night-audit" },
  { key: "settings", label: "Settings", suffix: "/settings" },
] as const;

/**
 * Top-of-page tab strip so every Accounts sub-page is reachable when the sidebar
 * only shows one collapsed "Accounts" entry — true for admins/GMs. Department-scoped
 * Accounts staff already get the full sub-page list in their sidebar (see
 * department-access.ts), so this renders nothing for them. Mirrors ProcurementSubNav.
 */
export function AccountsSubNav({ slug, canAccessAllDepartments }: { slug: string; canAccessAllDepartments: boolean }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/accounts`;

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
