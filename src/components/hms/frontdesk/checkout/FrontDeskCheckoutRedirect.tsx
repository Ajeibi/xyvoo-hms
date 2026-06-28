"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Legacy checkout page — opens the checkout dialog and returns to the board. */
export function FrontDeskCheckoutRedirect({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const reservationId = searchParams.get("reservationId") ?? undefined;
    const room = searchParams.get("room") ?? undefined;
    const params = new URLSearchParams({ checkout: "1" });
    if (reservationId) params.set("checkoutReservation", reservationId);
    if (room) params.set("checkoutRoom", room);
    router.replace(`/hms/${slug}/frontdesk?${params.toString()}`);
  }, [router, searchParams, slug]);

  return (
    <p className="p-8 text-sm text-slate-500">Opening checkout…</p>
  );
}
