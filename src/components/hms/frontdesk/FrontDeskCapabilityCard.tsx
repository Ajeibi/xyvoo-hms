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
import {
  FRONT_DESK_ACCENT_BORDER_CLASS,
  FRONT_DESK_ACCENT_WELL_CLASS,
} from "@/lib/hms/frontdesk-capabilities";
import { cn } from "@/lib/utils";

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
        "group block rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-slate-200/40 transition-all",
        "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md hover:shadow-slate-200/60",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 focus-visible:ring-offset-2",
        "border-l-4 pl-4",
        FRONT_DESK_ACCENT_BORDER_CLASS[accent],
      )}
      aria-label={label}
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-colors",
            FRONT_DESK_ACCENT_WELL_CLASS[accent],
            "group-hover:brightness-[0.98]",
          )}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </div>
        <span className="flex shrink-0 items-center gap-0.5 text-xs font-medium uppercase tracking-[0.2em] text-slate-400 transition-colors group-hover:text-blue-600">
          Open
          <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      <h3 className="mt-5 text-base font-semibold leading-snug tracking-tight text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{subtitle}</p>
      {supplement ? (
        <p className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 px-2.5 py-1.5 text-[11px] font-medium tabular-nums text-slate-600">
          {supplement}
        </p>
      ) : null}
    </Link>
  );
}
