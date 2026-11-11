"use client";

import { useEffect, useMemo, useState } from "react";
import { mergeBookingOptions, type BookingOption, type BookingOptionKind, type CustomBookingOption } from "@/lib/hms/booking-options-shared";

/**
 * The pick-list for a booking source or market segment: the built-ins at once, then the hotel's own once
 * they load. Pass `keep` (the stay's current value) so a value that has since been switched off still shows.
 */
export function useBookingOptions(
  slug: string,
  kind: BookingOptionKind,
  opts?: { style?: "reservation" | "check_in"; keep?: string | null; includeInactive?: boolean },
): BookingOption[] {
  const [custom, setCustom] = useState<CustomBookingOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/booking-options?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : { custom: [] }))
      .then((d: { custom?: CustomBookingOption[] }) => {
        if (!cancelled) setCustom(d.custom ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const style = opts?.style;
  const keep = opts?.keep;
  const includeInactive = opts?.includeInactive;
  return useMemo(() => mergeBookingOptions(kind, custom, { style, keep, includeInactive }), [kind, custom, style, keep, includeInactive]);
}
