"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight, LayoutDashboard, LogOut, PlusCircle } from "lucide-react";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin" },
  { icon: Building2, label: "Tenants", path: "/tenants" },
  { icon: PlusCircle, label: "Onboard Hotel", path: "/onboard" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="w-60 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
              <span className="text-white text-xs font-bold tracking-tight">X</span>
            </div>
            <div>
              <span className="text-slate-900 font-bold text-base tracking-tight">XYVOO</span>
              <p className="text-slate-400 text-[10px] uppercase tracking-widest leading-none mt-0.5">Admin</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {navItems.map(({ icon: Icon, label, path }) => {
            const active = pathname === path || (path !== "/admin" && pathname.startsWith(path));
            return (
              <Link
                key={path}
                href={path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active ? "bg-blue-50 text-blue-600" : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {active ? <ChevronRight className="w-3 h-3 opacity-40" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pb-4 border-t border-slate-200 pt-3 space-y-0.5">
          <div className="px-3 py-2">
            <p className="text-xs font-semibold text-slate-800 truncate">Admin User</p>
            <p className="text-[11px] text-slate-400 truncate">admin@xyvoo.com</p>
          </div>
          <Link href="/auth/login" className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all">
            <LogOut className="w-4 h-4" />
            Sign out
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
