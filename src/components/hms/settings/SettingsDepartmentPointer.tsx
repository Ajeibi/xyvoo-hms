import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";

/** Points the admin at a department's OWN settings page for day-to-day operational setup
 * (adding items, marking things out of stock, etc.) that shouldn't have to route through the
 * central hub — the hub stays for the rare/structural configuration only. */
export function SettingsDepartmentPointer({
  title,
  description,
  href,
  linkLabel,
  icon: Icon,
  meaning = "neutral",
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
  icon?: React.ComponentType<{ className?: string }>;
  meaning?: HmsMeaning;
}) {
  const tone = HMS_MEANING[meaning];
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-5 ${tone.tint}`}>
      {Icon ? (
        <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${tone.iconBox}`}>
          <Icon className="h-5 w-5" />
        </span>
      ) : null}
      <div className="min-w-0">
        <h3 className="font-heading text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{description}</p>
        <Link
          href={href}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-blue-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {linkLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
