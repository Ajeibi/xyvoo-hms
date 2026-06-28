import type { FrontDeskCheckoutItem, FrontDeskPendingArrivalItem } from "@/lib/hms/front-desk-board";
import { LogIn, LogOut } from "lucide-react";

function ActivityList({
  items,
  emptyMessage,
}: {
  items: { key: string; node: React.ReactNode }[];
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li
          key={item.key}
          className="rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm"
        >
          {item.node}
        </li>
      ))}
    </ul>
  );
}

export function FrontDeskDailyActivity({
  expectedCheckouts,
  pendingCheckIns,
}: {
  expectedCheckouts: FrontDeskCheckoutItem[];
  pendingCheckIns: FrontDeskPendingArrivalItem[];
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-2" aria-label="Daily activity">
      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <LogOut className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Today</p>
            <h2 className="text-lg font-semibold text-slate-900">Expected checkouts</h2>
          </div>
        </div>
        <div className="mt-5">
          <ActivityList
            items={expectedCheckouts.map((item) => ({
              key: item.confirmationCode,
              node: (
                <>
                  <p className="font-semibold text-slate-900">{item.guestName}</p>
                  <p className="mt-1 text-slate-600">
                    Room {item.roomCode} · Checkout {item.checkoutTime}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {item.paymentLabel} · {item.confirmationCode}
                  </p>
                </>
              ),
            }))}
            emptyMessage="No departures scheduled for today."
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <LogIn className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Today</p>
            <h2 className="text-lg font-semibold text-slate-900">Pending check-ins</h2>
          </div>
        </div>
        <div className="mt-5">
          <ActivityList
            items={pendingCheckIns.map((item) => ({
              key: item.confirmationCode,
              node: (
                <>
                  <p className="font-semibold text-slate-900">{item.guestName}</p>
                  <p className="mt-1 text-slate-600">
                    {item.roomCode ? `Room ${item.roomCode}` : "Room TBD"} · Check-in {item.checkInTime}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">Ref {item.confirmationCode}</p>
                </>
              ),
            }))}
            emptyMessage="No pending arrivals for today."
          />
        </div>
      </div>
    </section>
  );
}
