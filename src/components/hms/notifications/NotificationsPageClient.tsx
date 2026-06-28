"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  NotificationListItem,
  type NotificationListItemData,
} from "@/components/hms/header/NotificationListItem";
import { toastError, toastSuccess } from "@/lib/app-toast";

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

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant={filter === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("all")}
        >
          All
        </Button>
        <Button
          type="button"
          variant={filter === "unread" ? "default" : "outline"}
          size="sm"
          onClick={() => setFilter("unread")}
        >
          Unread
        </Button>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void clearRead()}>
            Clear read
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void clearAll()}>
            Clear all
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
          <p className="text-sm text-slate-500">No notifications to show.</p>
        </div>
      ) : (
        <ul className="space-y-3">
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
