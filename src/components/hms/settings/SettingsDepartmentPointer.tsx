import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Points the admin at a department's OWN settings page for day-to-day operational setup
 * (adding items, marking things out of stock, etc.) that shouldn't have to route through the
 * central hub — the hub stays for the rare/structural configuration only. */
export function SettingsDepartmentPointer({
  title,
  description,
  href,
  linkLabel,
}: {
  title: string;
  description: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5">
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
      >
        {linkLabel}
        <ArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
