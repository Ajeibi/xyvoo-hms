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
    <nav className="-mx-8 mb-6 flex gap-1 overflow-x-auto px-8 py-1">
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
