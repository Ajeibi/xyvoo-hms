"use client";

import { useCallback, useEffect, useState } from "react";
import {
  acknowledgeAllFbNotifications,
  acknowledgeFbNotification,
  getFbPendingNotifications,
  ingestFbOrderSnapshot,
  isReadyServiceNotification,
  readyServiceOrderIds,
  subscribeFbPendingNotifications,
  type FbNotifyArea,
  type FbStatusNotification,
} from "@/lib/hms/fb-status-notifications";
import { useFbRealtime } from "@/hooks/useFbRealtime";

async function syncReadyAcknowledgment(slug: string, notes: FbStatusNotification[]) {
  const orderIds = readyServiceOrderIds(notes);
  if (!orderIds.length) return;
  await fetch("/api/hotel/fb/orders/acknowledge-ready", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, orderIds }),
  });
}

export function useFbOrderStatusNotifications(
  slug: string,
  tenantId: string | null,
  area: FbNotifyArea,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false;
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
    if (!enabled) return;
    refreshPending();
  }, [enabled, refreshPending]);

  useEffect(() => {
    if (!enabled) return;
    return subscribeFbPendingNotifications(slug, area, refreshPending);
  }, [slug, area, refreshPending, enabled]);

  useEffect(() => {
    if (!enabled) return;
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
  }, [slug, area, refreshPending, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void syncOrders();
  }, [syncOrders, enabled]);

  useFbRealtime(tenantId, enabled ? () => void syncOrders() : () => undefined);

  const acknowledge = useCallback(
    (id: string) => {
      const current = getFbPendingNotifications(slug, area);
      const target = current.find((n) => n.id === id);
      acknowledgeFbNotification(slug, area, id);
      refreshPending();
      if (area === "restaurant" && target && isReadyServiceNotification(target)) {
        void syncReadyAcknowledgment(slug, [target]);
      }
    },
    [slug, area, refreshPending],
  );

  const acknowledgeAll = useCallback(() => {
    const current = getFbPendingNotifications(slug, area);
    if (area === "restaurant") {
      void syncReadyAcknowledgment(slug, current);
    }
    acknowledgeAllFbNotifications(slug, area);
    refreshPending();
  }, [slug, area, refreshPending]);

  return { pending, acknowledge, acknowledgeAll };
}
