"use client";

import { FbOrderHistoryClient } from "@/components/hms/fb/FbOrderHistoryClient";
import type { FbOrderHistoryRow } from "@/lib/hms/load-fb-pages";

export function KitchenHistoryClient({
  slug,
  tenantId,
  currency,
  initial,
  overdueMinutes,
}: {
  slug: string;
  tenantId: string;
  currency: string;
  initial: { rows: FbOrderHistoryRow[] };
  overdueMinutes?: number;
  hidePrices?: boolean;
}) {
  return (
    <FbOrderHistoryClient
      slug={slug}
      tenantId={tenantId}
      currency={currency}
      initial={initial}
      showAmount={false}
      overdueMinutes={overdueMinutes}
      description="Completed and voided tickets (read-only)."
      historyApiPath="/api/hotel/fb/kitchen/history"
    />
  );
}
