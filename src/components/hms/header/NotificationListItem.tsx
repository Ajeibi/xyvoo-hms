"use client";

import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import { HMS_MEANING } from "@/components/hms/meaning";

export type NotificationListItemData = {
  id: string;
  title: string;
  body: string;
  severity: string;
  createdAt: string;
  read: boolean;
};

/** Urgent alerts carry the "needs someone now" colour; everything else stays calm. */
const SEVERITY: Record<string, { label: string; pill: string; icon: typeof Info; box: string }> = {
  critical: { label: "Urgent", pill: "bg-red-50 text-red-800", icon: CircleAlert, box: HMS_MEANING.attention.iconBox },
  warning: { label: "Check soon", pill: "bg-amber-50 text-amber-800", icon: TriangleAlert, box: HMS_MEANING.guests.iconBox },
  info: { label: "For information", pill: "bg-slate-100 text-slate-700", icon: Info, box: HMS_MEANING.neutral.iconBox },
};

export function NotificationListItem({
  item,
  onMarkRead,
  compact = false,
}: {
  item: NotificationListItemData;
  onMarkRead?: (id: string) => void;
  compact?: boolean;
}) {
  const time = new Date(item.createdAt).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const sev = SEVERITY[item.severity] ?? SEVERITY.info;
  const Icon = sev.icon;

  return (
    <article
      className={`flex gap-3 rounded-2xl border px-4 py-3 ${
        item.read ? "border-slate-200 bg-slate-50" : item.severity === "critical" ? "border-rose-200 bg-white shadow-sm" : "border-slate-200 bg-white shadow-sm"
      }`}
    >
      <span aria-hidden className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${sev.box}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className={`text-sm font-semibold ${item.read ? "text-slate-700" : "text-slate-900"}`}>
            {!item.read ? (
              <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-blue-600 align-middle" aria-hidden />
            ) : null}
            {item.title}
            {!item.read ? <span className="sr-only"> (unread)</span> : null}
          </h3>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${sev.pill}`}>{sev.label}</span>
        </div>
        {!compact ? <p className="mt-1 text-sm text-slate-700">{item.body}</p> : null}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <time dateTime={item.createdAt}>{time}</time>
          {!item.read && onMarkRead ? (
            <button
              type="button"
              className="rounded font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              onClick={() => onMarkRead(item.id)}
            >
              Mark as read<span className="sr-only">: {item.title}</span>
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
