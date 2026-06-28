import Link from "next/link";
import type { FrontDeskKpiTile } from "@/lib/hms/front-desk-board";
import {
  FRONT_DESK_ACCENT_BORDER_CLASS,
  FRONT_DESK_ACCENT_WELL_CLASS,
} from "@/lib/hms/frontdesk-capabilities";
import { TrendingUp } from "lucide-react";

const SCROLL_TARGETS: Record<string, string> = {
  "arrivals-kpi": "#fd-movement-timeline",
  "departures-kpi": "#fd-movement-timeline",
  "overdue-checkouts": "#fd-movement-timeline",
  "shift-handover-note": "#fd-shift-notes",
};

export function FrontDeskLiveKpiSection({ tiles }: { tiles: FrontDeskKpiTile[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const href = SCROLL_TARGETS[tile.key];
        const inner = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${FRONT_DESK_ACCENT_WELL_CLASS[tile.accent]}`}
              >
                <TrendingUp className="h-4 w-4" aria-hidden />
              </div>
              <span className="text-2xl font-bold tabular-nums tracking-tight text-slate-900">{tile.value}</span>
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">{tile.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{tile.subtitle}</p>
            <p className="mt-2 text-xs font-medium text-slate-600">{tile.detail}</p>
            {href ? (
              <p className="mt-2 text-xs font-medium text-blue-600">View details →</p>
            ) : null}
          </>
        );

        return href ? (
          <Link
            key={tile.key}
            id={`fd-kpi-${tile.key}`}
            href={href}
            className={`block rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm shadow-slate-200/20 transition-colors hover:border-blue-200 ${FRONT_DESK_ACCENT_BORDER_CLASS[tile.accent]}`}
          >
            {inner}
          </Link>
        ) : (
          <article
            key={tile.key}
            id={`fd-kpi-${tile.key}`}
            className={`rounded-2xl border border-slate-200 border-l-4 bg-white p-5 shadow-sm shadow-slate-200/20 ${FRONT_DESK_ACCENT_BORDER_CLASS[tile.accent]}`}
          >
            {inner}
          </article>
        );
      })}
    </div>
  );
}
