"use client";

import { useFbOrderStatusNotifications } from "@/hooks/useFbOrderStatusNotifications";
import type { FbNotifyArea } from "@/lib/hms/fb-status-notifications";

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
  /** GM / owner oversight — live board only, no toast notifications */
  observerMode?: boolean;
  children: React.ReactNode;
}) {
  useFbOrderStatusNotifications(slug, tenantId, area, { enabled: !observerMode });

  return <>{children}</>;
}
