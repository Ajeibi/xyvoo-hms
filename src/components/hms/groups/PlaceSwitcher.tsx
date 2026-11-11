"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Building2, Check, ChevronDown, Network } from "lucide-react";
import type { UserPlace } from "@/lib/hms/groups/group-types";

/**
 * Switch between the hotels a login works at and the groups it runs. Only shown when there is
 * somewhere else to go, so someone with one hotel never sees it.
 */
export function PlaceSwitcher({ places, current, tone = "light" }: { places: UserPlace[]; current: { kind: "hotel" | "group"; slug: string }; tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const hotels = places.filter((p) => p.kind === "hotel");
  const groups = places.filter((p): p is Extract<UserPlace, { kind: "group" }> => p.kind === "group" && p.hotelCount > 1);
  if (hotels.length + groups.length < 2) return null;

  const isCurrent = (p: UserPlace) => p.kind === current.kind && p.slug === current.slug;
  const button =
    tone === "dark"
      ? "border-white/20 bg-white/10 text-white hover:bg-white/20"
      : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${button}`}
      >
        <Network className="h-4 w-4" aria-hidden />
        <span className="hidden sm:inline">Switch hotel</span>
        <ChevronDown className="h-4 w-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-slate-800 shadow-lg">
          {groups.length ? <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Hotel groups</p> : null}
          {groups.map((g) => (
            <Link
              key={`g-${g.groupId}`}
              role="menuitem"
              href={`/hms-group/${g.slug}/dashboard`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Network className="h-4 w-4 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {g.name} <span className="text-slate-500">· {g.hotelCount} hotels</span>
              </span>
              {isCurrent(g) ? <Check className="h-4 w-4 text-blue-700" aria-label="You are here" /> : null}
            </Link>
          ))}
          {hotels.length ? <p className="px-3 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">Hotels</p> : null}
          {hotels.map((h) => (
            <Link
              key={`h-${h.slug}`}
              role="menuitem"
              href={`/hms/${h.slug}/dashboard`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50"
            >
              <Building2 className="h-4 w-4 text-slate-500" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{h.name}</span>
              {isCurrent(h) ? <Check className="h-4 w-4 text-blue-700" aria-label="You are here" /> : null}
            </Link>
          ))}
          <Link role="menuitem" href="/hms-group" onClick={() => setOpen(false)} className="mt-1 block border-t border-slate-100 px-3 py-2 text-sm text-blue-700 hover:bg-slate-50">
            See all my places
          </Link>
        </div>
      ) : null}
    </div>
  );
}
