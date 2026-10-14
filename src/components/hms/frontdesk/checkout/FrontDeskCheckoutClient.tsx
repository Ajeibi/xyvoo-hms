"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, LogOut, RefreshCw, Wallet } from "lucide-react";
import {
  HmsCard,
  HmsEmptyState,
  HmsPage,
  HmsPageHeader,
  HmsPill,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
} from "@/components/hms/hms-ui";
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

  const overdue = initialRows.filter((r) => r.isOverdue).length;
  const owing = initialRows.filter((r) => r.balance > 0).length;
  const open = (row: CheckoutDueRow) =>
    openCheckoutDialog({ reservationId: row.reservationId, roomCode: row.roomCode ?? undefined });

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="rooms"
        title="Check-out"
        description="Guests due to leave today, plus anyone who should have left on an earlier day."
        actions={
          <button type="button" className={hmsButton.secondary} onClick={() => router.refresh()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </button>
        }
      />

      <HmsStatStrip label="Check-outs at a glance" columns={3}>
        <HmsStatTile label="Due to leave" value={initialRows.length} hint="Today and overdue" icon={LogOut} meaning="rooms" />
        <HmsStatTile
          label="Overdue"
          value={overdue}
          hint="No one is late leaving"
          icon={AlarmClock}
          meaning="attention"
          status={overdue > 0 ? "critical" : undefined}
          statusText={overdue > 0 ? "Past their check-out time" : undefined}
        />
        <HmsStatTile
          label="Still owe money"
          value={owing}
          hint="Every bill is settled"
          icon={Wallet}
          meaning="money"
          status={owing > 0 ? "warning" : undefined}
          statusText={owing > 0 ? "Settle before they leave" : undefined}
        />
      </HmsStatStrip>

      <HmsCard
        id="checkout-due"
        icon={LogOut}
        meaning="rooms"
        title="Guests leaving"
        description="Select a guest to review their bill and check them out."
        flush
      >
        {initialRows.length === 0 ? (
          <HmsEmptyState
            bare
            art="bell"
            meaning="rooms"
            title="No one is due to leave right now"
            description="Guests due to check out today will appear here."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Guests due to check out</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                  <th scope="col" className="py-3 pl-6 pr-4">Guest</th>
                  <th scope="col" className="py-3 pr-4">Room</th>
                  <th scope="col" className="py-3 pr-4">Leaving</th>
                  <th scope="col" className="py-3 pr-4 text-right">Balance</th>
                  <th scope="col" className="py-3 pr-4 text-right">Status</th>
                  <th scope="col" className="py-3 pr-6 text-right">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {initialRows.map((row) => (
                  <tr
                    key={row.reservationId}
                    className={`cursor-pointer transition-colors hover:bg-sky-50/60 ${row.isOverdue ? "border-l-4 border-l-red-500" : ""}`}
                    onClick={() => open(row)}
                  >
                    <td className="py-3 pl-6 pr-4">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                          <span className="truncate">{row.guestName}</span>
                          {row.isVip ? <HmsPill tone="amber">VIP</HmsPill> : null}
                        </p>
                        <p className="truncate text-xs text-slate-600">{row.confirmationCode}</p>
                      </div>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {row.roomCode ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-900">
                          Room {row.roomCode}
                        </span>
                      ) : (
                        <span>
                          <span aria-hidden>—</span>
                          <span className="sr-only">No room</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{formatDeparture(row.departureAt)}</td>
                    <td className="py-3 pr-4 text-right">
                      <span className={`font-semibold tabular-nums ${row.balance > 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {formatPricingAmount(row.balance, currency)}
                      </span>
                      <span className="block text-xs text-slate-600">{row.balance > 0 ? "To pay" : "Settled"}</span>
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {row.isOverdue ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">
                          <AlarmClock className="h-3 w-3" aria-hidden />
                          Overdue
                        </span>
                      ) : (
                        <HmsPill tone="blue">Due today</HmsPill>
                      )}
                    </td>
                    <td className="py-3 pr-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className={hmsButton.secondary} onClick={() => open(row)}>
                        Check out<span className="sr-only"> {row.guestName}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
    </HmsPage>
  );
}
