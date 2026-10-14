import type { ComponentType } from "react";
import Link from "next/link";
import type { FrontDeskKpiTile } from "@/lib/hms/front-desk-board";
import { FRONT_DESK_ACCENT_TILE_CLASS, type FrontDeskAccent } from "@/lib/hms/frontdesk-capabilities";
import { AlertTriangle, BedDouble, ChevronRight, CreditCard, FileSpreadsheet, UserPlus, Users } from "lucide-react";

const SCROLL_TARGETS: Record<string, string> = {
  "arrivals-kpi": "#fd-movement-timeline",
  "departures-kpi": "#fd-movement-timeline",
  "overdue-checkouts": "#fd-movement-timeline",
  "shift-handover-note": "#fd-shift-notes",
};

const ACCENT_ICON: Record<FrontDeskAccent, ComponentType<{ className?: string }>> = {
  checkin: UserPlus,
  rooms: BedDouble,
  guest: Users,
  incidents: AlertTriangle,
  financial: CreditCard,
  admin: FileSpreadsheet,
};

export function FrontDeskLiveKpiSection({ tiles }: { tiles: FrontDeskKpiTile[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => {
        const href = SCROLL_TARGETS[tile.key];
        const tone = FRONT_DESK_ACCENT_TILE_CLASS[tile.accent];
        const Icon = ACCENT_ICON[tile.accent];
        const inner = (
          <>
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">{tile.title}</h3>
              <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm ${tone.iconBox}`}>
                <Icon className="h-[18px] w-[18px]" />
              </span>
            </div>
            <p className="mt-0.5 font-heading text-2xl font-bold tabular-nums tracking-tight text-slate-900">{tile.value}</p>
            <p className="mt-1 text-xs text-slate-600">{tile.subtitle}</p>
            <p className="mt-2 text-xs font-medium text-slate-700">{tile.detail}</p>
            {href ? (
              <p className="mt-2 flex items-center gap-0.5 text-xs font-semibold text-blue-700">
                View details
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              </p>
            ) : null}
          </>
        );

        return href ? (
          <Link
            key={tile.key}
            id={`fd-kpi-${tile.key}`}
            href={href}
            className={`block rounded-2xl p-4 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${tone.tint}`}
          >
            {inner}
          </Link>
        ) : (
          <article key={tile.key} id={`fd-kpi-${tile.key}`} className={`rounded-2xl p-4 ${tone.tint}`}>
            {inner}
          </article>
        );
      })}
    </div>
  );
}
