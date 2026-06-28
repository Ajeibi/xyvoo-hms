"use client";

export type NotificationListItemData = {
  id: string;
  title: string;
  body: string;
  severity: string;
  createdAt: string;
  read: boolean;
};

const SEVERITY_CLASS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  warning: "bg-amber-100 text-amber-900",
  info: "bg-slate-100 text-slate-700",
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
  const time = new Date(item.createdAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <article
      className={`rounded-xl border px-4 py-3 ${item.read ? "border-slate-100 bg-slate-50/50 opacity-80" : "border-slate-200 bg-white"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className={`text-sm font-semibold ${item.read ? "text-slate-600" : "text-slate-900"}`}>
          {item.title}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_CLASS[item.severity] ?? SEVERITY_CLASS.info}`}
        >
          {item.severity}
        </span>
      </div>
      {!compact ? <p className="mt-1 text-sm text-slate-600">{item.body}</p> : null}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <time dateTime={item.createdAt}>{time}</time>
        {!item.read && onMarkRead ? (
          <button
            type="button"
            className="font-medium text-blue-600 hover:underline"
            onClick={() => onMarkRead(item.id)}
          >
            Mark read
          </button>
        ) : null}
      </div>
    </article>
  );
}
