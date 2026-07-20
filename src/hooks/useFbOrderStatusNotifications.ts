"use client";

import { useCallback, useEffect } from "react";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { toastInfo, toastSuccess } from "@/lib/app-toast";
import {
  checkForFbNotifications,
  isReadyServiceNotification,
  readyServiceOrderIds,
  type FbNotifyArea,
} from "@/lib/hms/fb-status-notifications";

async function acknowledgeReadyOrders(slug: string, orderIds: string[]) {
  if (!orderIds.length) return;
  await fetch("/api/hotel/fb/orders/acknowledge-ready", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, orderIds }),
  });
}

/**
 * Fires a toast for each new, non-self-caused F&B status change since the
 * last check for this (slug, area) pair — no persisted "pending" queue and
 * nothing to acknowledge. A toast that's missed is simply gone, same as any
 * other transient alert; the live board itself remains the source of truth.
 */
export function useFbOrderStatusNotifications(
  slug: string,
  tenantId: string | null,
  area: FbNotifyArea,
  options?: { enabled?: boolean },
) {
  const enabled = options?.enabled !== false;

  const syncOrders = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (!res.ok) return;

    const events = checkForFbNotifications(slug, area, data.orders ?? []);
    if (!events.length) return;

    for (const event of events) {
      if (isReadyServiceNotification(event)) {
        toastSuccess(event.message);
      } else {
        toastInfo(event.message);
      }
    }

    if (area === "restaurant") {
      const orderIds = readyServiceOrderIds(events);
      if (orderIds.length) void acknowledgeReadyOrders(slug, orderIds);
    }
  }, [slug, area]);

  useEffect(() => {
    if (!enabled) return;
    void syncOrders();
  }, [syncOrders, enabled]);

  useFbRealtime(tenantId, enabled ? () => void syncOrders() : () => undefined);
}
