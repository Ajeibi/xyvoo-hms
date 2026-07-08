"use client";

import { KitchenDepartmentNav } from "@/components/hms/kitchen/KitchenDepartmentNav";
import { FbSectionWithNotifications } from "@/components/hms/fb/FbSectionWithNotifications";

export function KitchenShell({
  slug,
  tenantId,
  observerMode = false,
  showDepartmentNav = false,
  children,
}: {
  slug: string;
  tenantId: string;
  observerMode?: boolean;
  showDepartmentNav?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FbSectionWithNotifications
      slug={slug}
      tenantId={tenantId}
      area="kitchen"
      observerMode={observerMode}
    >
      {showDepartmentNav ? <KitchenDepartmentNav slug={slug} /> : null}
      {children}
    </FbSectionWithNotifications>
  );
}
