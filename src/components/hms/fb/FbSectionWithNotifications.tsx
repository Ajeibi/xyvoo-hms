"use client";

import { useEffect } from "react";
import { FbStatusNotificationBar } from "@/components/hms/fb/FbStatusNotificationBar";
import { useFbOrderStatusNotifications } from "@/hooks/useFbOrderStatusNotifications";
import {
  acknowledgeAllFbNotifications,
  ingestFbOrderSnapshot,
  type FbNotifyArea,
} from "@/lib/hms/fb-status-notifications";

export function FbSectionWithNotifications({
  slug,
  tenantId,
  area,
  observerMode = false,
  children,
}: {
  slug: string;
  tenantId: string | null;
  area: FbNotifyArea;
  /** GM / owner oversight — live board only, no acknowledge flow */
  observerMode?: boolean;
  children: React.ReactNode;
}) {
  const { pending, acknowledge, acknowledgeAll } = useFbOrderStatusNotifications(
    slug,
    tenantId,
    area,
    { enabled: !observerMode },
  );

  useEffect(() => {
    if (!observerMode) return;
    const sync = async () => {
      const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      if (!res.ok) return;
      ingestFbOrderSnapshot(slug, data.orders ?? []);
      acknowledgeAllFbNotifications(slug, area);
    };
    void sync();
  }, [slug, area, observerMode]);

  return (
    <div className="flex min-h-full flex-col">
      {!observerMode ? (
        <div className="sticky top-0 z-20">
          <FbStatusNotificationBar
            pending={pending}
            onAcknowledge={acknowledge}
            onAcknowledgeAll={acknowledgeAll}
          />
        </div>
      ) : null}
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
