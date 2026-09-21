"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ExternalLink, LayoutDashboard, LogOut, Package, Settings, ShoppingCart } from "lucide-react";

type StorefrontDashboardShellProps = {
  children: React.ReactNode;
  slug: string;
  storeDisplayName: string;
  logoUrl: string | null;
  currentUserName: string;
  roleLabel: string;
};

export default function StorefrontDashboardShell({
  children,
  slug,
  storeDisplayName,
  logoUrl,
  currentUserName,
  roleLabel,
}: StorefrontDashboardShellProps) {
  const pathname = usePathname();
  const base = `/storefront/${slug}`;

  const navItems = [
    { key: "dashboard", label: "Overview", path: `${base}/dashboard`, icon: LayoutDashboard },
    { key: "products", label: "Products", path: `${base}/products`, icon: Package },
    { key: "orders", label: "Orders", path: `${base}/orders`, icon: ShoppingCart },
    { key: "settings", label: "Settings", path: `${base}/settings`, icon: Settings },
  ];

  const activeKey =
    navItems
      .filter((item) => pathname === item.path || pathname.startsWith(`${item.path}/`))
      .sort((a, b) => b.path.length - a.path.length)[0]?.key ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <aside className="flex w-56 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-slate-200 px-5">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt="Store logo"
              className="h-7 w-7 rounded-lg border border-slate-200 bg-slate-50 object-contain"
            />
          ) : (
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-white">
              {(storeDisplayName || slug).charAt(0).toUpperCase() || "S"}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-800">{storeDisplayName}</p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{roleLabel}</p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-3">
          {navItems.map(({ key, label, path, icon: Icon }) => {
            const active = activeKey === key;
            return (
              <Link
                key={key}
                href={path}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 px-3 pb-4 pt-3">
          <p className="truncate px-3 text-xs text-slate-500">{currentUserName}</p>
          <form action="/auth/logout?redirect=/auth/login/storefront" method="post">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-slate-400 transition-colors hover:text-slate-600"
            >
              <LogOut className="h-3 w-3" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur">
          <p className="text-sm font-medium text-slate-700">
            {navItems.find((item) => item.key === activeKey)?.label || "Storefront"}
          </p>
          <a
            href={`/shop/${slug}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            View storefront
            <ExternalLink className="h-3 w-3" />
          </a>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
