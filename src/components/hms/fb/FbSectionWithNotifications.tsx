"use client";

import { FbStatusNotificationBar } from "@/components/hms/fb/FbStatusNotificationBar";
import { useFbOrderStatusNotifications } from "@/hooks/useFbOrderStatusNotifications";
import type { FbNotifyArea } from "@/lib/hms/fb-status-notifications";

export function FbSectionWithNotifications({
  slug,
  tenantId,
  area,
  children,
}: {
  slug: string;
  tenantId: string | null;
  area: FbNotifyArea;
  children: React.ReactNode;
}) {
  const { pending, acknowledge, acknowledgeAll } = useFbOrderStatusNotifications(
    slug,
    tenantId,
    area,
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-20">
        <FbStatusNotificationBar
          pending={pending}
          onAcknowledge={acknowledge}
          onAcknowledgeAll={acknowledgeAll}
        />
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
