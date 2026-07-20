"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { openCheckoutDialog } from "@/lib/hms/open-checkout-bus";
import type { CheckoutDueRow } from "@/lib/hms/frontdesk-checkout";

function formatDeparture(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function FrontDeskCheckoutClient({
  slug,
  currency,
  initialRows,
}: {
  slug: string;
  currency: string;
  initialRows: CheckoutDueRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const reservationId = searchParams.get("reservationId") ?? searchParams.get("checkoutReservation");
    const room = searchParams.get("room") ?? searchParams.get("checkoutRoom");
    if (reservationId || room) {
      openCheckoutDialog({ reservationId: reservationId ?? undefined, roomCode: room ?? undefined });
      router.replace(`/hms/${slug}/frontdesk/checkout`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to consume the deep-link params
  }, []);

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Front desk</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Checkout</h1>
          <p className="mt-1 text-sm text-slate-500">
            Guests due to check out today, plus anyone overdue from a previous day.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => router.refresh()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {initialRows.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-16 text-center text-sm text-slate-500">
          No guests due to check out right now.
        </p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-6 pr-4 font-medium">Guest</th>
                <th className="py-3 pr-4 font-medium">Room</th>
                <th className="py-3 pr-4 font-medium">Departure</th>
                <th className="py-3 pr-4 text-right font-medium">Balance</th>
                <th className="py-3 pr-6 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialRows.map((row) => (
                <tr
                  key={row.reservationId}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() =>
                    openCheckoutDialog({ reservationId: row.reservationId, roomCode: row.roomCode ?? undefined })
                  }
                >
                  <td className="py-3 pl-6 pr-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">
                        {row.guestName}
                        {row.isVip ? (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                            VIP
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-slate-500">{row.confirmationCode}</p>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {row.roomCode ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium">
                        Room {row.roomCode}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">{formatDeparture(row.departureAt)}</td>
                  <td className="py-3 pr-4 text-right">
                    <span
                      className={`font-semibold tabular-nums ${
                        row.balance > 0 ? "text-red-600" : "text-emerald-600"
                      }`}
                    >
                      {formatPricingAmount(row.balance, currency)}
                    </span>
                  </td>
                  <td className="py-3 pr-6 text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        row.isOverdue ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"
                      }`}
                    >
                      {row.isOverdue ? "Overdue" : "Due today"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
