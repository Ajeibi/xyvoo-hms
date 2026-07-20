"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createHotelBrowserClient } from "@/lib/supabase/hotel-browser";

const INVENTORY_TABLES = [
  "inventory_stock_levels",
  "inventory_stock_movements",
  "inventory_requisitions",
  "inventory_requisition_lines",
  "inventory_transfers",
  "inventory_stock_counts",
] as const;

type InventoryTable = (typeof INVENTORY_TABLES)[number];

type ChannelEntry = {
  channel: RealtimeChannel;
  refCount: number;
  subscribers: Set<(table: InventoryTable) => void>;
  liveListeners: Set<(live: boolean) => void>;
};

const channelRegistry = new Map<string, ChannelEntry>();

function notifySubscribers(entry: ChannelEntry, table: InventoryTable) {
  for (const cb of entry.subscribers) {
    try {
      cb(table);
    } catch {
      /* subscriber errors should not break realtime */
    }
  }
}

function setLiveForEntry(entry: ChannelEntry, live: boolean) {
  for (const cb of entry.liveListeners) cb(live);
}

function getOrCreateChannel(tenantId: string): ChannelEntry {
  const existing = channelRegistry.get(tenantId);
  if (existing) return existing;

  const supabase = createHotelBrowserClient();
  const entry: ChannelEntry = {
    channel: supabase.channel(`inventory-${tenantId}`),
    refCount: 0,
    subscribers: new Set(),
    liveListeners: new Set(),
  };

  let channel = entry.channel;
  for (const table of INVENTORY_TABLES) {
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

/** Inventory & Store realtime — subscribes only to inventory_* tables. */
export function useInventoryRealtime(tenantId: string | null, onEvent?: () => void, enabled = true) {
  const [live, setLive] = useState(false);
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || !tenantId) return;

    const entry = getOrCreateChannel(tenantId);
    entry.refCount += 1;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        handlerRef.current?.();
      }, 400);
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
