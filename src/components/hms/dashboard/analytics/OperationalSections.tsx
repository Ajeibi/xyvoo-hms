"use client";

import Link from "next/link";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  type ChartOptions,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  type TooltipItem,
  Tooltip,
} from "chart.js";
import {
  Activity,
  BarChart3,
  CalendarRange,
  Package,
  Soup,
  Stars,
  UtensilsCrossed,
} from "lucide-react";
import { Bar, Line } from "react-chartjs-2";
import type {
  FloorStatusItem,
  OccupancyTrend,
  RoomStatusItem,
} from "./dashboard-analytics-types";
import type { MetricTileItem, StatusRowItem, SummaryTileItem } from "./shared";
import { AnalyticsCard, MetricTile, StatusRow, SummaryTile } from "./shared";

ChartJS.register(
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
);

export function ReservationsFrontDeskCard({ items }: { items: MetricTileItem[] }) {
  return (
    <AnalyticsCard
      icon={CalendarRange}
      title="Reservations & Front Desk"
      description="Daily movement from reservations (UTC day boundaries)."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <MetricTile key={item.label} {...item} />
        ))}
      </div>
    </AnalyticsCard>
  );
}

export function OccupancyStatisticsCard({
  trend,
  description = "Occupancy from reservation room-nights vs inventory (UTC months).",
}: {
  trend: OccupancyTrend;
  description?: string;
}) {
  const occupancyData = {
    labels: trend.labels,
    datasets: [
      {
        label: "Occupancy %",
        data: trend.values,
        borderColor: "rgba(37, 99, 235, 0.95)",
        backgroundColor: "rgba(37, 99, 235, 0.14)",
        fill: true,
        tension: 0.38,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 3,
      },
    ],
  };

  const occupancyOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(tooltipItem: TooltipItem<"line">) {
            return `${tooltipItem.parsed.y ?? 0}% occupancy`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { color: "#64748b", font: { size: 11 } },
      },
      y: {
        min: 0,
        max: 100,
        ticks: {
          stepSize: 20,
          color: "#94a3b8",
          callback(value: string | number) {
            return `${value}%`;
          },
          font: { size: 11 },
        },
        grid: { color: "rgba(148, 163, 184, 0.16)" },
        border: { display: false },
      },
    },
  };

  return (
    <AnalyticsCard
      icon={BarChart3}
      title="Occupancy Statistics"
      description={description}
    >
      <div className="h-[340px]">
        <Line data={occupancyData} options={occupancyOptions} />
      </div>
    </AnalyticsCard>
  );
}

const ROOM_STATUS_DESCRIPTION =
  "Inventory keys by housekeeping status. Occupied counts only keys with an in-house check-in; keys left occupied after stays are removed show as vacant clean.";

const FLOOR_STATUS_DESCRIPTION =
  "In-house stays per floor (keys tied to an active check-in; floor from each key’s record).";

export function RoomStatusCard({
  items,
  description = ROOM_STATUS_DESCRIPTION,
}: {
  items: RoomStatusItem[];
  description?: string;
}) {
  return (
    <AnalyticsCard
      icon={Activity}
      title="Room Status"
      description={description}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4"
          >
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</p>
          </div>
        ))}
      </div>
    </AnalyticsCard>
  );
}

export function FloorStatusCard({
  items,
  description = FLOOR_STATUS_DESCRIPTION,
}: {
  items: FloorStatusItem[];
  description?: string;
}) {
  const floorStatusData = {
    labels: items.map((item) => item.label),
    datasets: [
      {
        label: "Occupied",
        data: items.map((item) => item.value),
        backgroundColor: items.map((item) => item.color),
        borderRadius: 999,
        borderSkipped: false,
        barThickness: 16,
      },
    ],
  };

  const floorStatusOptions: ChartOptions<"bar"> = {
    responsive: true,
    maintainAspectRatio: false,
    indexAxis: "y",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label(tooltipItem) {
            const n = tooltipItem.parsed.x ?? 0;
            return `${n} occupied`;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        grid: { color: "rgba(148, 163, 184, 0.16)" },
        border: { display: false },
        ticks: {
          color: "#94a3b8",
          precision: 0,
          font: { size: 11 },
        },
      },
      y: {
        grid: { display: false },
        border: { display: false },
        ticks: {
          color: "#475569",
          font: { size: 12, weight: 600 },
        },
      },
    },
  };

  return (
    <AnalyticsCard
      icon={Stars}
      title="Floor Status"
      description={description}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="h-[220px] min-w-0 flex-1">
          <Bar data={floorStatusData} options={floorStatusOptions} />
        </div>
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <span className={`h-2.5 w-2.5 rounded-full ${item.colorClass}`} />
              <p className="flex-1 text-sm text-slate-500">{item.label}</p>
              <p className="text-sm font-semibold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </AnalyticsCard>
  );
}

export function FoodBeverageCard({
  items,
  outletBreakdownItems,
}: {
  items: MetricTileItem[];
  outletBreakdownItems: StatusRowItem[];
}) {
  return (
    <AnalyticsCard
      icon={UtensilsCrossed}
      title="Food & Beverage"
      description="Restaurant, bar, and room-service activity for today."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <MetricTile key={item.label} {...item} />
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {outletBreakdownItems.map((item) => (
          <StatusRow key={item.title} {...item} />
        ))}
      </div>
    </AnalyticsCard>
  );
}

export function KitchenCard({
  items,
  alertItems,
  setupHref,
}: {
  items: MetricTileItem[];
  alertItems: StatusRowItem[];
  /** Shown when kitchen timing has not been configured in back office */
  setupHref?: string | null;
}) {
  return (
    <AnalyticsCard
      icon={Soup}
      title="Kitchen"
      description="Prep flow, delays, and item availability for the current shift."
    >
      {setupHref ? (
        <Link
          href={setupHref}
          className="mb-5 block rounded-2xl border border-amber-200 bg-amber-50/80 px-4 py-4 text-sm text-amber-950 transition-colors hover:bg-amber-50"
        >
          <p className="font-semibold">Configure kitchen order timing</p>
          <p className="mt-1 leading-6 text-amber-900/90">
            Set how long tickets can wait before turning red. Until configured, the default is 10
            minutes.
          </p>
          <span className="mt-2 inline-block text-sm font-semibold text-blue-700">
            Open kitchen settings →
          </span>
        </Link>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <MetricTile key={item.label} {...item} />
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {alertItems.map((item) => (
          <StatusRow key={item.title} {...item} />
        ))}
      </div>
    </AnalyticsCard>
  );
}

export function InventoryWatchCard({
  summary,
  lowStockItems,
}: {
  summary: SummaryTileItem[];
  lowStockItems: StatusRowItem[];
}) {
  return (
    <AnalyticsCard
      icon={Package}
      title="Inventory Watch"
      description="Stock visibility for housekeeping and consumables."
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {summary.map((item) => (
          <SummaryTile key={item.label} {...item} />
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {lowStockItems.map((item) => (
          <StatusRow key={item.title} {...item} />
        ))}
      </div>
    </AnalyticsCard>
  );
}

export function AttentionCenterCard({ alerts }: { alerts: StatusRowItem[] }) {
  return (
    <AnalyticsCard
      icon={Activity}
      title="Attention Center"
      description="Exceptions derived from room status and recent reservation outcomes."
    >
      <div className="grid gap-3">
        {alerts.length === 0 ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4 text-sm text-slate-600">
            No alerts to display.
          </p>
        ) : (
          alerts.map((item) => <StatusRow key={item.title} {...item} />)
        )}
      </div>
    </AnalyticsCard>
  );
}
