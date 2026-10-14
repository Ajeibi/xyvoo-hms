"use client";

import { useSyncExternalStore } from "react";
import { Lightbulb, X } from "lucide-react";
import { Illustration, type IllustrationName } from "@/components/storefront/illustrations";
import { HMS_MEANING, type HmsMeaning } from "./meaning";

/** Interactive hotel page blocks, matching the store dashboard's (components/storefront/dashboard-ui.tsx). */

const CHIP_ON: Record<HmsMeaning, string> = {
  money: "border-emerald-600 bg-emerald-50 text-emerald-900",
  rooms: "border-sky-600 bg-sky-50 text-sky-900",
  guests: "border-amber-600 bg-amber-50 text-amber-900",
  stock: "border-teal-600 bg-teal-50 text-teal-900",
  food: "border-orange-600 bg-orange-50 text-orange-900",
  care: "border-violet-600 bg-violet-50 text-violet-900",
  team: "border-indigo-600 bg-indigo-50 text-indigo-900",
  attention: "border-rose-600 bg-rose-50 text-rose-900",
  neutral: "border-blue-600 bg-blue-50 text-blue-900",
};

/** One-tap filters with counts, such as "Due today (3)". Exactly one is pressed at a time. */
export function HmsFilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  meaning = "neutral",
}: {
  label: string;
  options: Array<{ value: T; label: string; count?: number | null }>;
  value: T;
  onChange: (value: T) => void;
  meaning?: HmsMeaning;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              on ? CHIP_ON[meaning] : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            }`}
          >
            {o.label}
            {o.count != null ? <span className={`rounded-full px-1.5 text-xs ${on ? "bg-white/80" : "bg-slate-100 text-slate-600"}`}>{o.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const INTRO_PREFIX = "xyvoo_hms_intro_hidden_";
const introListeners = new Set<() => void>();
const introHiddenInMemory = new Set<string>();

function introHidden(id: string) {
  try {
    return localStorage.getItem(INTRO_PREFIX + id) === "1" || introHiddenInMemory.has(id);
  } catch {
    return introHiddenInMemory.has(id);
  }
}

function hideIntro(id: string) {
  introHiddenInMemory.add(id);
  try {
    localStorage.setItem(INTRO_PREFIX + id, "1");
  } catch {
    // Storage blocked: hidden until the page is reloaded.
  }
  introListeners.forEach((l) => l());
}

function subscribeIntro(listener: () => void) {
  introListeners.add(listener);
  return () => {
    introListeners.delete(listener);
  };
}

/**
 * A friendly "what you can do here" card at the top of a section, shown until it's closed.
 * It never blocks the page. Closing it is remembered in this browser.
 */
export function HmsSectionIntro({
  id,
  title,
  points,
  meaning = "neutral",
  art,
  action,
}: {
  id: string;
  title: string;
  points: React.ReactNode[];
  meaning?: HmsMeaning;
  art?: IllustrationName;
  action?: React.ReactNode;
}) {
  // Hidden on the server and until the browser says otherwise, so a closed card never flashes.
  const hidden = useSyncExternalStore(subscribeIntro, () => introHidden(id), () => true);
  if (hidden) return null;
  const tone = HMS_MEANING[meaning];
  return (
    <section aria-labelledby={`hms-intro-${id}`} className={`relative flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center ${tone.tint}`}>
      {art ? (
        <span className={`hidden shrink-0 sm:block ${tone.icon}`}>
          <Illustration name={art} />
        </span>
      ) : (
        <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.iconBox}`}>
          <Lightbulb className="h-5 w-5" />
        </span>
      )}
      <div className="min-w-0 flex-1 pr-8">
        <h2 id={`hms-intro-${id}`} className="font-heading text-lg font-semibold text-slate-900">
          {title}
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
          {points.map((p, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
              <span>{p}</span>
            </li>
          ))}
        </ul>
        {action ? <div className="mt-3">{action}</div> : null}
      </div>
      <button
        type="button"
        onClick={() => hideIntro(id)}
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <X className="h-4 w-4" aria-hidden />
        <span className="sr-only">Close this tip: {title}</span>
      </button>
    </section>
  );
}
