"use client";

import { useCallback, useSyncExternalStore } from "react";
import { type HotelClock, hotelClock } from "@/lib/hms/fb-price-rules";

/** Re-renders once a minute, on the minute. */
function subscribeToMinutes(listener: () => void) {
  let interval: number | undefined;
  const timeout = window.setTimeout(() => {
    listener();
    interval = window.setInterval(listener, 60_000);
  }, 60_000 - (Date.now() % 60_000));
  return () => {
    window.clearTimeout(timeout);
    if (interval !== undefined) window.clearInterval(interval);
  };
}

/**
 * The hotel's clock (day and minute in its time zone), updated every minute,
 * so happy-hour prices on the till switch on and off by themselves. null
 * while rendering on the server, so no rule is shown until the page is live.
 */
export function useHotelClock(timeZone: string): HotelClock | null {
  const getSnapshot = useCallback(() => {
    const clock = hotelClock(new Date(), timeZone);
    return `${clock.day}:${clock.minute}`;
  }, [timeZone]);
  const key = useSyncExternalStore(subscribeToMinutes, getSnapshot, () => "");
  if (!key) return null;
  const [day, minute] = key.split(":").map(Number);
  return { day, minute };
}
