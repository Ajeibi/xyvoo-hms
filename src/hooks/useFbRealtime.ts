"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createHotelBrowserClient } from "@/lib/supabase/hotel-browser";

const FB_TABLES = ["fb_orders", "fb_order_items", "fb_menu_items", "fb_tables"] as const;

type FbTable = (typeof FB_TABLES)[number];

type ChannelEntry = {
  channel: RealtimeChannel;
  refCount: number;
  subscribers: Set<(table: FbTable) => void>;
  liveListeners: Set<(live: boolean) => void>;
};

const channelRegistry = new Map<string, ChannelEntry>();

function notifySubscribers(entry: ChannelEntry, table: FbTable) {
  for (const cb of entry.subscribers) {
    try {
      cb(table);
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
    channel: supabase.channel(`fb-${tenantId}`),
    refCount: 0,
    subscribers: new Set(),
    liveListeners: new Set(),
  };

  let channel = entry.channel;
  for (const table of FB_TABLES) {
    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "hotel", table, filter: `tenant_id=eq.${tenantId}` },
      () => notifySubscribers(entry, table),
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

export type FbRealtimeHandlers = {
  /** Orders, line items, or table status changed. */
  onDataChange?: () => void;
  /** Menu availability changed (e.g. 86). */
  onMenuChange?: () => void;
};

/**
 * F&B / Kitchen realtime — subscribes only to fb_* tables (not the full front-desk bus).
 * No router refresh and no periodic polling.
 */
export function useFbRealtime(
  tenantId: string | null,
  onEvent?: (() => void) | FbRealtimeHandlers,
  enabled = true,
) {
  const [live, setLive] = useState(false);
  const handlersRef = useRef<FbRealtimeHandlers>({});
  if (typeof onEvent === "function") {
    handlersRef.current = { onDataChange: onEvent };
  } else if (onEvent) {
    handlersRef.current = onEvent;
  } else {
    handlersRef.current = {};
  }

  useEffect(() => {
    if (!enabled || !tenantId) return;

    const entry = getOrCreateChannel(tenantId);
    entry.refCount += 1;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const pending = { data: false, menu: false };

    const flush = () => {
      debounceTimer = null;
      const { onDataChange, onMenuChange } = handlersRef.current;
      if (pending.menu) onMenuChange?.();
      if (pending.data) onDataChange?.();
      pending.data = false;
      pending.menu = false;
    };

    const handler = (table: FbTable) => {
      if (table === "fb_menu_items") pending.menu = true;
      else pending.data = true;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(flush, 400);
    };

    entry.subscribers.add(handler);
    entry.liveListeners.add(setLive);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      entry.subscribers.delete(handler);
      entry.liveListeners.delete(setLive);
      releaseChannel(tenantId);
    };
  }, [tenantId, enabled]);

  return { live };
}
