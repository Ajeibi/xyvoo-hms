import Link from "next/link";
import type { FrontDeskAuditItem } from "@/lib/hms/front-desk-board";
import { History } from "lucide-react";

export function FrontDeskActivityFeed({ slug, items }: { slug: string; items: FrontDeskAuditItem[] }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <History className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Audit</p>
          <h2 className="text-lg font-semibold text-slate-900">Recent activity</h2>
        </div>
      </div>
      <ul className="mt-5 space-y-2">
        {items.length === 0 ? (
          <li className="text-sm text-slate-500">No activity recorded yet.</li>
        ) : (
          items.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-2.5 text-sm text-slate-700">
              {item.message}
            </li>
          ))
        )}
      </ul>
      <Link
        href={`/hms/${slug}/frontdesk/activity`}
        className="mt-4 inline-block text-sm font-medium text-blue-600 hover:underline"
      >
        View all activity
      </Link>
    </section>
  );
}
