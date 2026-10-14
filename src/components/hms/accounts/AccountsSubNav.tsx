"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { key: "dashboard", label: "Dashboard", suffix: "" },
  { key: "chart", label: "Chart of accounts", suffix: "/chart" },
  { key: "journal", label: "Journal entries", suffix: "/journal" },
  { key: "trial-balance", label: "Trial balance", suffix: "/trial-balance" },
  { key: "income-statement", label: "Income statement", suffix: "/income-statement" },
  { key: "balance-sheet", label: "Balance sheet", suffix: "/balance-sheet" },
  { key: "cash-flow", label: "Cash flow", suffix: "/cash-flow" },
  { key: "bank-reconciliation", label: "Bank reconciliation", suffix: "/bank-reconciliation" },
  { key: "bills", label: "Vendor bills", suffix: "/bills" },
  { key: "ap-aging", label: "AP ageing", suffix: "/ap-aging" },
  { key: "invoices", label: "Customer invoices", suffix: "/invoices" },
  { key: "ar-aging", label: "AR ageing", suffix: "/ar-aging" },
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
    <nav aria-label="Accounts pages" className="flex gap-2 overflow-x-auto py-1 print:hidden">
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
                ? "border-emerald-600 bg-emerald-50 text-emerald-900"
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
