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
          <Bell className="h-5 w-5" aria-hidden />
          {unread > 0 ? (
            <span
              aria-hidden
              className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-xyvoo-blue px-1 text-[11px] font-bold text-white ring-2 ring-white"
            >
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl p-2">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="font-heading text-base font-semibold text-slate-900">
            Notifications
            {unread > 0 ? <span className="ml-1.5 text-sm font-medium text-slate-600">({unread} unread)</span> : null}
          </span>
          <div className="flex gap-1">
            {items.some((n) => n.read) ? (
              <button
                type="button"
                onClick={() => void clearRead()}
                className="rounded-lg px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Clear read
              </button>
            ) : null}
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAllRead()}
                className="rounded-lg px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Mark all as read
              </button>
            ) : null}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-3 py-6 text-center">
            <span aria-hidden className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Bell className="h-5 w-5" />
            </span>
            <p className="mt-2 text-sm font-medium text-slate-900">No notifications yet</p>
            <p className="mt-0.5 text-xs text-slate-600">Alerts and reminders will appear here.</p>
          </div>
        ) : (
          <div className="max-h-[320px] space-y-2 overflow-y-auto px-1 py-1">
            {items.slice(0, 8).map((n) => (
              <NotificationListItem key={n.id} item={n} onMarkRead={markRead} compact />
            ))}
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="cursor-pointer rounded-xl">
          <Link href={notificationsPath} className="w-full justify-center text-center text-sm font-medium text-blue-700">
            See all notifications
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
