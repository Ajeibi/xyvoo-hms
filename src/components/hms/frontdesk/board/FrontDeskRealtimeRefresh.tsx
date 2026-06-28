"use client";

import { useFrontDeskRealtime } from "@/hooks/useFrontDeskRealtime";

export function FrontDeskRealtimeRefresh({
  tenantId,
  enabled = true,
}: {
  tenantId: string | null;
  enabled?: boolean;
}) {
  const { live } = useFrontDeskRealtime(tenantId, enabled, undefined, { debounceMs: 800 });

  if (!tenantId) return null;

  return (
    <span
      className={`ml-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
        live ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"
      }`}
      title={live ? "Realtime connected" : "Polling fallback"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`}
      />
      Live
    </span>
  );
}
