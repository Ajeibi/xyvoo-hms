"use client";

import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import { COUNTRY_LIST, INPUT_CLASS } from "@/features/hotel-register/constants";

export default function CountryDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
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
      <button type="button" onClick={() => { setOpen((v) => !v); setSearch(""); }} className={`${INPUT_CLASS} text-left flex items-center justify-between cursor-pointer`}>
        <span className={value ? "text-slate-800" : "text-slate-400"}>{value || "Select country"}</span>
        <Search className="w-4 h-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country..."
              className="w-full px-3 py-2 text-sm outline-none bg-slate-50 rounded-lg"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => { onChange(c.name); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors cursor-pointer ${value === c.name ? "text-blue-600 font-semibold" : "text-slate-700"}`}
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
