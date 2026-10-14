"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, BellDot, CheckCheck, CircleAlert, Trash2 } from "lucide-react";
import { HmsEmptyState, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import { HmsFilterChips } from "@/components/hms/hms-ui-client";
import {
  NotificationListItem,
  type NotificationListItemData,
} from "@/components/hms/header/NotificationListItem";
import { toastError, toastSuccess } from "@/lib/app-toast";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

export function NotificationsPageClient({
  slug,
  initialItems,
}: {
  slug: string;
  initialItems: NotificationListItemData[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [items, setItems] = useState(initialItems);

  const filtered = useMemo(
    () => (filter === "unread" ? items.filter((n) => !n.read) : items),
    [filter, items],
  );

  const reload = useCallback(async () => {
    const res = await fetch(`/api/hotel/notifications?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { notifications: NotificationListItemData[] };
    setItems(data.notifications ?? []);
    router.refresh();
  }, [slug, router]);

  const markRead = async (id: string) => {
    const res = await fetch("/api/hotel/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not mark as read", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Notification marked read");
    void reload();
  };

  const markAllRead = async () => {
    const res = await fetch("/api/hotel/notifications/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not mark all as read", data.error ?? "Try again.");
      return;
    }
    toastSuccess("All notifications marked read");
    void reload();
  };

  const clearRead = async () => {
    if (!confirm("Remove all read notifications?")) return;
    const res = await fetch("/api/hotel/notifications/clear", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, mode: "read" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not clear notifications", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Read notifications cleared");
    void reload();
  };

  const clearAll = async () => {
    if (!confirm("Remove all notifications? This cannot be undone.")) return;
    const res = await fetch("/api/hotel/notifications/clear", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, mode: "all" }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not clear notifications", data.error ?? "Try again.");
      return;
    }
    toastSuccess("All notifications cleared");
    void reload();
  };

  const unread = items.filter((n) => !n.read).length;
  const urgent = items.filter((n) => !n.read && n.severity === "critical").length;

  return (
    <div className="space-y-6">
      <HmsStatStrip label="Your notifications in figures" columns={3}>
        <HmsStatTile label="Unread" value={unread} icon={BellDot} meaning="neutral" hint="Not opened yet" />
        <HmsStatTile
          label="Urgent and unread"
          value={urgent}
          icon={CircleAlert}
          meaning="attention"
          hint="Nothing urgent waiting"
          status={urgent > 0 ? "critical" : undefined}
          statusText="Needs someone now"
        />
        <HmsStatTile label="All notifications" value={items.length} icon={Bell} meaning="neutral" hint="The latest 100" />
      </HmsStatStrip>

      <div className="flex flex-wrap items-center gap-3">
        <HmsFilterChips
          label="Show"
          meaning="neutral"
          options={[
            { value: "all", label: "All", count: items.length },
            { value: "unread", label: "Unread", count: unread },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="ml-auto flex flex-wrap gap-2">
          <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => void markAllRead()}>
            <CheckCheck className="h-4 w-4" aria-hidden />
            Mark all as read
          </button>
          <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={() => void clearRead()}>
            Clear read
          </button>
          <button type="button" className={`${hmsButton.danger} ${focusRing}`} onClick={() => void clearAll()}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Clear all
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <HmsEmptyState
          art="bell"
          meaning="neutral"
          title={filter === "unread" && items.length > 0 ? "You're all caught up" : "No notifications yet"}
          description={
            filter === "unread" && items.length > 0
              ? "Every notification has been read. New ones will appear here."
              : "Alerts, reminders and updates for your hotel will appear here."
          }
        />
      ) : (
        <ul className="space-y-3" aria-label="Notifications">
          {filtered.map((n) => (
            <li key={n.id}>
              <NotificationListItem item={n} onMarkRead={markRead} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
