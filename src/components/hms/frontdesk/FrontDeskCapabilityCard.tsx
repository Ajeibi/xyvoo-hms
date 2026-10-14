import type { ComponentType } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  BedDouble,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  UserPlus,
  Users,
} from "lucide-react";
import type { FrontDeskAccent } from "@/lib/hms/frontdesk-capabilities";
import { FRONT_DESK_ACCENT_WELL_CLASS } from "@/lib/hms/frontdesk-capabilities";
import { cn } from "@/lib/utils";

const ACCENT_HOVER_BORDER: Record<FrontDeskAccent, string> = {
  checkin: "hover:border-sky-300",
  rooms: "hover:border-sky-300",
  guest: "hover:border-amber-300",
  incidents: "hover:border-rose-300",
  financial: "hover:border-emerald-300",
  admin: "hover:border-slate-300",
};

const ACCENT_ICON: Record<FrontDeskAccent, ComponentType<{ className?: string }>> = {
  checkin: UserPlus,
  rooms: BedDouble,
  guest: Users,
  incidents: AlertTriangle,
  financial: CreditCard,
  admin: FileSpreadsheet,
};

export function FrontDeskCapabilityCard({
  title,
  subtitle,
  accent,
  href,
  supplement,
}: {
  title: string;
  subtitle: string;
  accent: FrontDeskAccent;
  href: string;
  supplement?: string;
}) {
  const label = supplement ? `${title}. ${subtitle}. ${supplement}` : `${title}. ${subtitle}`;
  const Icon = ACCENT_ICON[accent];

  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm transition-all",
        "hover:-translate-y-0.5 hover:shadow-md",
        ACCENT_HOVER_BORDER[accent],
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
      )}
      aria-label={label}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-slate-200/60 shadow-xs transition-colors",
            FRONT_DESK_ACCENT_WELL_CLASS[accent],
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </div>
        <span aria-hidden className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-slate-600 transition-colors group-hover:text-blue-700">
          Open
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      <h3 className="mt-4 font-heading text-base font-semibold leading-snug tracking-tight text-slate-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{subtitle}</p>
      {supplement ? (
        <p className="mt-3 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs font-medium tabular-nums text-slate-700">
          {supplement}
        </p>
      ) : null}
    </Link>
  );
}
