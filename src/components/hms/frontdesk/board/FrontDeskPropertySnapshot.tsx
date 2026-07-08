"use client";

import { CalendarDays, Users } from "lucide-react";

/** Same Reservations / Guests metrics as the admin dashboard overview. */
export function FrontDeskPropertySnapshot({
  reservationRecordCount,
  inHouseGuestHeadcount,
}: {
  reservationRecordCount: number;
  inHouseGuestHeadcount: number;
}) {
  const items = [
    {
      icon: CalendarDays,
      label: "Reservations",
      value: String(reservationRecordCount),
      description: "Total reservations on file for this property.",
    },
    {
      icon: Users,
      label: "Guests",
      value: String(inHouseGuestHeadcount),
      description: "Headcount on in-house stays (adults + children from active reservations).",
    },
  ];

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7"
      aria-label="Property snapshot metrics"
    >
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Property metrics</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
          >
            <div className="flex items-center gap-2 text-slate-500">
              <item.icon className="h-4 w-4" aria-hidden />
              <p className="text-[11px] font-medium uppercase tracking-[0.2em]">{item.label}</p>
            </div>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{item.value}</p>
            <p className="mt-2 text-xs leading-6 text-slate-500">{item.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
