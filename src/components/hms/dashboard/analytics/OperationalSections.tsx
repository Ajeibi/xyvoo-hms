"use client";

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
} from "./mock-data";
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

export function ReservationsFrontDeskCard({
  items,
  badge = "Preview",
}: {
  items: MetricTileItem[];
  badge?: string | null;
}) {
  return (
    <AnalyticsCard
      icon={CalendarRange}
      title="Reservations & Front Desk"
      badge={badge}
      description="Daily movement from live reservations (UTC day boundaries)."
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
  badge = "Preview",
  description = "Approximate occupancy from reservation room-nights vs inventory (UTC months).",
}: {
  trend: OccupancyTrend;
  badge?: string | null;
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
      badge={badge}
      description={description}
    >
      <div className="h-[340px]">
        <Line data={occupancyData} options={occupancyOptions} />
      </div>
    </AnalyticsCard>
  );
}

const ROOM_STATUS_LIVE_DESCRIPTION =
  "Inventory keys by housekeeping status. Occupied counts only keys with an in-house check-in; keys left occupied after stays are removed show as vacant clean.";

const FLOOR_STATUS_LIVE_DESCRIPTION =
  "In-house stays per floor (keys tied to an active check-in; floor from each key’s record).";

export function RoomStatusCard({
  items,
  badge = "Preview",
  description = ROOM_STATUS_LIVE_DESCRIPTION,
}: {
  items: RoomStatusItem[];
  badge?: string | null;
  description?: string;
}) {
  return (
    <AnalyticsCard
      icon={Activity}
      title="Room Status"
      badge={badge}
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
  badge = "Preview",
  description = FLOOR_STATUS_LIVE_DESCRIPTION,
}: {
  items: FloorStatusItem[];
  badge?: string | null;
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
      badge={badge}
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
  badge = "Preview",
}: {
  items: MetricTileItem[];
  outletBreakdownItems: StatusRowItem[];
  badge?: string | null;
}) {
  return (
    <AnalyticsCard
      icon={UtensilsCrossed}
      title="Food & Beverage"
      badge={badge}
      description="Quick commercial view of restaurant, bar, and room-service activity."
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
  badge = "Preview",
}: {
  items: MetricTileItem[];
  alertItems: StatusRowItem[];
  badge?: string | null;
}) {
  return (
    <AnalyticsCard
      icon={Soup}
      title="Kitchen"
      badge={badge}
      description="Fast service-execution view covering prep flow, delays, and item availability."
    >
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
  badge = "Preview",
}: {
  summary: SummaryTileItem[];
  lowStockItems: StatusRowItem[];
  badge?: string | null;
}) {
  return (
    <AnalyticsCard
      icon={Package}
      title="Inventory Watch"
      badge={badge}
      description="Operational stock visibility for housekeeping and consumables until live store data is connected."
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

export function AttentionCenterCard({
  alerts,
  badge = "Preview",
}: {
  alerts: StatusRowItem[];
  badge?: string | null;
}) {
  return (
    <AnalyticsCard
      icon={Activity}
      title="Attention Center"
      badge={badge}
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
