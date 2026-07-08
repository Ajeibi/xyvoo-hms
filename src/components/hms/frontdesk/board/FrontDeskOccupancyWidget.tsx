"use client";

import { ArcElement, Chart as ChartJS, Tooltip } from "chart.js";
import { Doughnut } from "react-chartjs-2";
import type { FrontDeskOccupancyStats } from "@/lib/hms/front-desk-board";

ChartJS.register(ArcElement, Tooltip);

export function FrontDeskOccupancyWidget({ stats }: { stats: FrontDeskOccupancyStats }) {
  const segments = [
    { label: "Occupied rooms", value: stats.occupiedRooms, color: "rgb(37, 99, 235)" },
    { label: "Available", value: stats.availableRooms, color: "rgb(16, 185, 129)" },
    { label: "Reserved", value: stats.reservedRooms, color: "rgb(251, 191, 36)" },
    { label: "Maintenance", value: stats.maintenanceRooms, color: "rgb(249, 115, 22)" },
  ];
  const total = Math.max(stats.totalRooms, 1);

  const doughnutData = {
    labels: segments.map((s) => s.label),
    datasets: [
      {
        data: segments.map((s) => s.value),
        backgroundColor: segments.map((s) => s.color),
        borderWidth: 0,
      },
    ],
  };

  return (
    <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/25 sm:p-7">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Occupancy</p>
      <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-center">
        <div className="mx-auto h-[140px] w-[140px] shrink-0 lg:mx-0">
          <Doughnut
            data={doughnutData}
            options={{
              cutout: "62%",
              plugins: { legend: { display: false }, tooltip: { enabled: true } },
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Property snapshot</h2>
          <p className="mt-1 text-sm text-slate-500">
            {stats.totalRooms} rooms · {stats.inHouseGuestHeadcount} guest
            {stats.inHouseGuestHeadcount === 1 ? "" : "s"} on property · {stats.occupiedRooms} room
            {stats.occupiedRooms === 1 ? "" : "s"} occupied ({stats.occupancyPercent}%)
          </p>
          <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
            {segments.map((seg, i) =>
              seg.value > 0 ? (
                <div
                  key={seg.label}
                  style={{
                    width: `${(seg.value / total) * 100}%`,
                    backgroundColor: segments[i].color,
                  }}
                  title={`${seg.label}: ${seg.value}`}
                />
              ) : null,
            )}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            {segments.map((seg, i) => (
              <div key={seg.label} className="rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5">
                <dt className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segments[i].color }} />
                  {seg.label}
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{seg.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
