"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { COUNTRY_LIST, INPUT_CLASS } from "@/features/hotel-register/constants";
import { cn } from "@/lib/utils";

export default function CountryDropdown({
  id,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const filtered = COUNTRY_LIST.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setSearch("");
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-describedby={describedBy}
        className={cn(
          INPUT_CLASS,
          "flex cursor-pointer items-center justify-between text-left",
          invalid && "border-rose-500 bg-rose-50/20 focus:ring-rose-400",
        )}
      >
        <span className={value ? "text-black" : "text-slate-600"}>{value || "Select country"}</span>
        <Search className="h-4 w-4 text-slate-500" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              aria-label="Search countries"
              className="w-full rounded-lg bg-slate-50 px-3 py-2 text-sm text-black placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-xyvoo-blue"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => {
                  onChange(c.name);
                  setOpen(false);
                }}
                className={cn(
                  "w-full cursor-pointer px-4 py-2.5 text-left text-sm transition-colors hover:bg-blue-50 focus-visible:bg-blue-50 focus-visible:outline-none",
                  value === c.name ? "font-semibold text-xyvoo-blue-deep" : "text-slate-800",
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
