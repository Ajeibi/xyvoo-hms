"use client";

import { FbDepartmentNav } from "@/components/hms/fb/FbDepartmentNav";
import { FbSectionWithNotifications } from "@/components/hms/fb/FbSectionWithNotifications";

export function FbRestaurantBarShell({
  slug,
  tenantId,
  observerMode = false,
  showDepartmentNav = false,
  children,
}: {
  slug: string;
  tenantId: string;
  observerMode?: boolean;
  /** Admin / GM sub-nav (POS, tables, settings, etc.) */
  showDepartmentNav?: boolean;
  children: React.ReactNode;
}) {
  return (
    <FbSectionWithNotifications
      slug={slug}
      tenantId={tenantId}
      area="restaurant"
      observerMode={observerMode}
    >
      {showDepartmentNav ? <FbDepartmentNav slug={slug} /> : null}
      {children}
    </FbSectionWithNotifications>
  );
}
