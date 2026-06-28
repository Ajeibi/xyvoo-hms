"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createHotelBrowserClient } from "@/lib/supabase/hotel-browser";

const TABLES = [
  "room_units",
  "reservations",
  "room_incidents",
  "notifications",
  "shift_notes",
  "audit_logs",
  "housekeeping_tasks",
  "folio_transactions",
  "guest_requests",
  "guest_request_notes",
  "guest_request_events",
  "room_blocks",
  "room_connecting_links",
  "room_unit_notes",
  "fb_orders",
  "fb_order_items",
  "fb_menu_items",
] as const;

type ChannelEntry = {
  channel: RealtimeChannel;
  refCount: number;
  subscribers: Set<() => void>;
  liveListeners: Set<(live: boolean) => void>;
};

const channelRegistry = new Map<string, ChannelEntry>();

function notifySubscribers(entry: ChannelEntry) {
  for (const cb of entry.subscribers) {
    try {
      cb();
    } catch {
      /* subscriber errors should not break realtime */
    }
  }
}

function setLiveForEntry(entry: ChannelEntry, live: boolean) {
  for (const cb of entry.liveListeners) {
    cb(live);
  }
}

function getOrCreateChannel(tenantId: string): ChannelEntry {
  const existing = channelRegistry.get(tenantId);
  if (existing) return existing;

  const supabase = createHotelBrowserClient();
  const entry: ChannelEntry = {
    channel: supabase.channel(`frontdesk-${tenantId}`),
    refCount: 0,
    subscribers: new Set(),
    liveListeners: new Set(),
  };

  let channel = entry.channel;
  for (const table of TABLES) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "hotel", table, filter: `tenant_id=eq.${tenantId}` },
      (payload) => {
        if (table === "notifications" && payload.eventType === "INSERT") {
          const row = payload.new as { severity?: string };
          if (row.severity === "critical" && localStorage.getItem("fd-mute-alerts") !== "1") {
            try {
              const audio = new Audio("/sounds/notification.mp3");
              void audio.play().catch(() => undefined);
            } catch {
              /* optional sound file may be missing */
            }
          }
        }
        notifySubscribers(entry);
      },
    );
  }
  entry.channel = channel;

  channel.subscribe((status) => {
    setLiveForEntry(entry, status === "SUBSCRIBED");
  });

  channelRegistry.set(tenantId, entry);
  return entry;
}

function releaseChannel(tenantId: string) {
  const entry = channelRegistry.get(tenantId);
  if (!entry) return;

  entry.refCount -= 1;
  if (entry.refCount > 0) return;

  const supabase = createHotelBrowserClient();
  void supabase.removeChannel(entry.channel);
  channelRegistry.delete(tenantId);
}

export type FrontDeskRealtimeOptions = {
  /** Debounce burst events (ms). Default 800. */
  debounceMs?: number;
  /** Call `router.refresh()` on events. Default true. */
  routerRefresh?: boolean;
};

export function useFrontDeskRealtime(
  tenantId: string | null,
  enabled = true,
  onEvent?: () => void,
  options?: FrontDeskRealtimeOptions,
) {
  const router = useRouter();
  const [live, setLive] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const debounceMs = options?.debounceMs ?? 800;
  const routerRefresh = options?.routerRefresh ?? true;

  useEffect(() => {
    if (!enabled || !tenantId) return;

    const entry = getOrCreateChannel(tenantId);
    entry.refCount += 1;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      debounceTimer = null;
      if (routerRefresh) router.refresh();
      onEventRef.current?.();
    };

    const handler = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, debounceMs);
    };

    entry.subscribers.add(handler);
    entry.liveListeners.add(setLive);

    const poll = window.setInterval(() => {
      if (routerRefresh) router.refresh();
      onEventRef.current?.();
    }, 60_000);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.clearInterval(poll);
      entry.subscribers.delete(handler);
      entry.liveListeners.delete(setLive);
      releaseChannel(tenantId);
    };
  }, [tenantId, enabled, router, debounceMs, routerRefresh]);

  return { live };
}
