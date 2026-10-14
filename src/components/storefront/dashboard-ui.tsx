"use client";

import { useSyncExternalStore } from "react";
import { Lightbulb, X } from "lucide-react";
import { Illustration, type IllustrationName } from "./illustrations";
import { MEANING, type Meaning } from "./meaning";

// The display-only blocks, for client components that import everything from here.
export { dashInput, DashField, DashAlert, DashStatus, DashPageHeader, DashCard, DashEmptyState, DashStatTile, DashStatStrip, percentChange, dashButton, DashPill } from "./dashboard-blocks";

/** Small form pieces shared by the store dashboard screens. */

/** One-tap filters with counts, such as "To send (3)". Exactly one is pressed at a time. */
export function DashFilterChips<T extends string>({
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
  meaning?: Meaning;
}) {
  const tone = MEANING[meaning];
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
            className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue ${
              on ? tone.chipOn : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
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

const INTRO_PREFIX = "xyvoo_intro_hidden_";
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
export function DashSectionIntro({
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
  meaning?: Meaning;
  art?: IllustrationName;
  action?: React.ReactNode;
}) {
  // Hidden on the server and until the browser says otherwise, so a closed card never flashes.
  const hidden = useSyncExternalStore(subscribeIntro, () => introHidden(id), () => true);
  if (hidden) return null;
  const tone = MEANING[meaning];
  return (
    <section aria-labelledby={`intro-${id}`} className={`relative flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center ${tone.tint}`}>
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
        <h2 id={`intro-${id}`} className="font-heading text-lg font-semibold text-slate-900">
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
        className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-white/70 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue"
      >
        <X className="h-4 w-4" aria-hidden />
        <span className="sr-only">Close this tip: {title}</span>
      </button>
    </section>
  );
}

export async function sendJson(url: string, method: "POST" | "PUT" | "PATCH" | "DELETE", body?: object) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
  return data;
}
