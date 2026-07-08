"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Live clock for wait-time UI. Returns null until after mount so SSR and the
 * first client render stay in sync (avoids hydration mismatches on time-based styles).
 */
export function useClientNow(tickMs = 15_000): [number | null, () => void] {
  const [now, setNow] = useState<number | null>(null);
  const refresh = useCallback(() => setNow(Date.now()), []);

  useEffect(() => {
    refresh();
    const id = window.setInterval(refresh, tickMs);
    return () => window.clearInterval(id);
  }, [tickMs, refresh]);

  return [now, refresh];
}
