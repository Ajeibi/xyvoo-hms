"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  NotificationListItem,
  type NotificationListItemData,
} from "@/components/hms/header/NotificationListItem";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { REFRESH_NOTIFICATIONS_EVENT } from "@/lib/hms/notifications-bus";

export function HmsNotificationsBell({
  slug,
  initialUnread = 0,
}: {
  slug: string;
  initialUnread?: number;
}) {
  const router = useRouter();
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationListItemData[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hotel/notifications?slug=${encodeURIComponent(slug)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { notifications: NotificationListItemData[]; unreadCount: number };
    setItems(data.notifications ?? []);
    setUnread(data.unreadCount ?? 0);
  }, [slug]);

  useEffect(() => {
    setUnread(initialUnread);
  }, [initialUnread]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    const onRefresh = () => void load();
    window.addEventListener(REFRESH_NOTIFICATIONS_EVENT, onRefresh);
    return () => window.removeEventListener(REFRESH_NOTIFICATIONS_EVENT, onRefresh);
  }, [load]);

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
    void load();
    router.refresh();
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
    void load();
    router.refresh();
  };

  const clearRead = async () => {
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
    void load();
    router.refresh();
  };

  const notificationsPath = `/hms/${slug}/notifications`;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative h-10 w-10 rounded-xl text-slate-600"
          aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-xyvoo-blue px-1 text-[10px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-2xl p-2">
        <DropdownMenuLabel className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-semibold">Notifications</span>
          <div className="flex gap-2">
            {items.some((n) => n.read) ? (
              <button
                type="button"
                onClick={() => void clearRead()}
                className="text-xs font-medium text-slate-500 hover:underline"
              >
                Clear read
              </button>
            ) : null}
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No notifications yet.</p>
        ) : (
          <div className="max-h-[320px] space-y-2 overflow-y-auto px-1 py-1">
            {items.slice(0, 8).map((n) => (
              <NotificationListItem key={n.id} item={n} onMarkRead={markRead} compact />
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
          <Link href={notificationsPath} className="w-full text-center text-sm text-blue-600">
            View all
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
