"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HmsPill } from "@/components/hms/hms-ui";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  describeDue,
  isOverdue,
  type WoPriority,
  type WoStatus,
  type WorkOrder,
} from "@/lib/hms/maintenance-shared";

/** Calls a Maintenance route and returns the error text (or null on success) plus any data. */
export async function callApi<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
): Promise<{ error: string | null; data: T | null }> {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) return { error: json.error ?? "Something went wrong. Try again.", data: null };
    return { error: null, data: json };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again.", data: null };
  }
}

const TABS = [
  { label: "Dashboard", suffix: "" },
  { label: "Work orders", suffix: "/orders" },
  { label: "Equipment", suffix: "/assets" },
  { label: "Planned", suffix: "/planned" },
  { label: "Reports", suffix: "/reports" },
  { label: "Settings", suffix: "/settings" },
];

export function MaintenanceSubNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const base = `/hms/${slug}/maintenance`;
  return (
    <nav aria-label="Maintenance pages" className="-mx-3 flex gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
      {TABS.map((tab) => {
        const href = `${base}${tab.suffix}`;
        const active = tab.suffix === "" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? "border-violet-600 bg-violet-50 text-violet-900"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function PriorityPill({ priority }: { priority: WoPriority }) {
  const tone = priority === "urgent" ? "red" : priority === "high" ? "amber" : priority === "low" ? "slate" : "blue";
  return <HmsPill tone={tone}>{PRIORITY_LABEL[priority]}</HmsPill>;
}

export function StatusPill({ status }: { status: WoStatus }) {
  const tone = status === "completed" ? "green" : status === "cancelled" ? "slate" : status === "on_hold" ? "amber" : status === "in_progress" ? "blue" : "slate";
  return <HmsPill tone={tone}>{STATUS_LABEL[status]}</HmsPill>;
}

/** "3h late" in red, or "due in 5h" in grey. Nothing for closed orders. */
export function DueText({ wo }: { wo: Pick<WorkOrder, "status" | "slaDueAt"> }) {
  if (wo.status === "completed" || wo.status === "cancelled") return null;
  if (wo.status === "on_hold") return <span className="text-xs text-slate-500">Clock paused</span>;
  const late = isOverdue(wo);
  return <span className={`text-xs ${late ? "font-semibold text-red-700" : "text-slate-500"}`}>{describeDue(wo.slaDueAt)}</span>;
}
