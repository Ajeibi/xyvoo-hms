"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeAllFbNotifications,
  acknowledgeFbNotification,
  getFbPendingNotifications,
  ingestFbOrderSnapshot,
  subscribeFbPendingNotifications,
  type FbNotifyArea,
  type FbStatusNotification,
} from "@/lib/hms/fb-status-notifications";
import { useFbRealtime } from "@/hooks/useFbRealtime";

export function useFbOrderStatusNotifications(
  slug: string,
  tenantId: string | null,
  area: FbNotifyArea,
) {
  const [pending, setPending] = useState<FbStatusNotification[]>([]);

  const refreshPending = useCallback(() => {
    setPending(getFbPendingNotifications(slug, area));
  }, [slug, area]);

  const syncOrders = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok) return;
    ingestFbOrderSnapshot(slug, data.orders ?? []);
    refreshPending();
  }, [slug, refreshPending]);

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  useEffect(() => {
    return subscribeFbPendingNotifications(slug, area, refreshPending);
  }, [slug, area, refreshPending]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (
        event.key === `fb-status-notifs:${slug}:${area}` ||
        event.key === `fb-status-acked:${slug}:${area}`
      ) {
        refreshPending();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [slug, area, refreshPending]);

  useEffect(() => {
    void syncOrders();
  }, [syncOrders]);

  useFbRealtime(tenantId, () => void syncOrders());

  const acknowledge = useCallback(
    (id: string) => {
      acknowledgeFbNotification(slug, area, id);
      refreshPending();
    },
    [slug, area, refreshPending],
  );

  const acknowledgeAll = useCallback(() => {
    acknowledgeAllFbNotifications(slug, area);
    refreshPending();
  }, [slug, area, refreshPending]);

  return { pending, acknowledge, acknowledgeAll };
}
