"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, BedDouble, RefreshCw, Wallet } from "lucide-react";
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
import { HmsFilterChips } from "@/components/hms/hms-ui-client";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { InHouseStayRow, StaysView } from "@/lib/hms/frontdesk-stays";

function formatDay(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short" });
}

export function FrontDeskStaysClient({
  slug,
  currency,
  rows,
  initialView,
}: {
  slug: string;
  currency: string;
  rows: InHouseStayRow[];
  initialView: StaysView;
}) {
  const router = useRouter();
  const [view, setView] = useState<StaysView>(initialView);

  const unpaidCount = rows.filter((r) => r.unpaid).length;
  const guestCount = rows.reduce((sum, r) => sum + r.guests, 0);
  const shown = view === "unpaid" ? rows.filter((r) => r.unpaid) : rows;

  function changeView(next: StaysView) {
    setView(next);
    router.replace(`/hms/${slug}/frontdesk/stays?view=${next}`, { scroll: false });
  }

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="guests"
        title="Guests staying"
        description="Everyone in the hotel now, with what they owe. Choose “Nothing paid yet” to see who has not paid or left a deposit."
        actions={
          <button type="button" className={hmsButton.secondary} onClick={() => router.refresh()}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Refresh
          </button>
        }
      />

      <HmsStatStrip label="Stays at a glance" columns={3}>
        <HmsStatTile label="Stays" value={rows.length} hint="Checked in now" icon={BedDouble} meaning="rooms" />
        <HmsStatTile label="Guests on property" value={guestCount} hint="Adults and children" icon={BedDouble} meaning="guests" />
        <HmsStatTile
          label="Nothing paid yet"
          value={unpaidCount}
          hint="Everyone has paid something"
          icon={Wallet}
          meaning="money"
          status={unpaidCount > 0 ? "warning" : undefined}
          statusText={unpaidCount > 0 ? "No payment or deposit on the bill" : undefined}
        />
      </HmsStatStrip>

      <HmsFilterChips<StaysView>
        label="Show"
        options={[
          { value: "in-house", label: "All guests staying", count: rows.length },
          { value: "unpaid", label: "Nothing paid yet", count: unpaidCount },
        ]}
        value={view}
        onChange={changeView}
        meaning={view === "unpaid" ? "money" : "guests"}
      />

      <HmsCard
        id="stays-list"
        icon={view === "unpaid" ? Wallet : BedDouble}
        meaning={view === "unpaid" ? "money" : "guests"}
        title={view === "unpaid" ? "Nothing paid yet" : "Guests staying"}
        description="Select a guest to open their bill."
        flush
      >
        {shown.length === 0 ? (
          <HmsEmptyState
            bare
            art="bell"
            meaning={view === "unpaid" ? "money" : "guests"}
            title={view === "unpaid" ? "Everyone has paid something" : "No one is staying right now"}
            description={
              view === "unpaid"
                ? "Guests with no payment or deposit on their bill will appear here."
                : "Guests appear here once they are checked in."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{view === "unpaid" ? "Stays with nothing paid yet" : "Guests staying"}</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700">
                  <th scope="col" className="py-3 pl-6 pr-4">Guest</th>
                  <th scope="col" className="py-3 pr-4">Room</th>
                  <th scope="col" className="py-3 pr-4">Stay</th>
                  <th scope="col" className="py-3 pr-4 text-right">Balance</th>
                  <th scope="col" className="py-3 pr-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((row) => (
                  <tr key={row.reservationId} className={row.isOverdue ? "border-l-4 border-l-red-500" : undefined}>
                    <td className="py-3 pl-6 pr-4">
                      <Link
                        href={`/hms/${slug}/frontdesk/folio?reservationId=${row.reservationId}`}
                        className="font-medium text-slate-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        {row.guestName}
                      </Link>
                      {row.isVip ? (
                        <span className="ml-2">
                          <HmsPill tone="amber">VIP</HmsPill>
                        </span>
                      ) : null}
                      <p className="truncate text-xs text-slate-600">
                        {row.confirmationCode} · {row.guests} guest{row.guests === 1 ? "" : "s"}
                      </p>
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
                    <td className="py-3 pr-4 text-slate-700">
                      {formatDay(row.arrivalAt)} to {formatDay(row.departureAt)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      <span className={`font-semibold tabular-nums ${row.balance > 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {formatPricingAmount(row.balance, currency)}
                      </span>
                      <span className="block text-xs text-slate-600">{row.balance > 0 ? "To pay" : "Settled"}</span>
                    </td>
                    <td className="py-3 pr-6 text-right">
                      <div className="flex flex-col items-end gap-1">
                        {row.unpaid ? <HmsPill tone="amber">Nothing paid yet</HmsPill> : null}
                        {row.isOverdue ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-800">
                            <AlarmClock className="h-3 w-3" aria-hidden />
                            Overdue
                          </span>
                        ) : null}
                      </div>
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
