"use client";

import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { BarChart3, TrendingUp } from "lucide-react";
import type { FrontDeskAnalytics } from "@/lib/hms/front-desk-board";
import { AnalyticsCard } from "@/components/hms/dashboard/analytics/shared";

ChartJS.register(
  ArcElement,
  BarElement,
  CategoryScale,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
);

const chartFont = { family: "inherit", size: 11 };

export function FrontDeskAnalyticsSection({
  analytics,
  usedLiveData,
}: {
  analytics: FrontDeskAnalytics;
  usedLiveData: boolean;
}) {
  const badge = usedLiveData ? "Live" : "Preview";

  const occupancyData = {
    labels: analytics.occupancyTrend.labels,
    datasets: [
      {
        label: "Occupancy %",
        data: analytics.occupancyTrend.values,
        borderColor: "rgb(37, 99, 235)",
        backgroundColor: "rgba(37, 99, 235, 0.12)",
        fill: true,
        tension: 0.35,
      },
    ],
  };

  const checkInBar = {
    labels: analytics.dailyCheckIns.labels,
    datasets: [
      {
        label: "Check-ins",
        data: analytics.dailyCheckIns.values,
        backgroundColor: "rgba(16, 185, 129, 0.85)",
        borderRadius: 6,
      },
    ],
  };

  const checkOutBar = {
    labels: analytics.dailyCheckOuts.labels,
    datasets: [
      {
        label: "Check-outs",
        data: analytics.dailyCheckOuts.values,
        backgroundColor: "rgba(249, 115, 22, 0.85)",
        borderRadius: 6,
      },
    ],
  };

  const mixData = {
    labels: ["Available", "Occupied / reserved"],
    datasets: [
      {
        data: [analytics.roomMix.available, analytics.roomMix.occupied],
        backgroundColor: ["rgba(16, 185, 129, 0.9)", "rgba(37, 99, 235, 0.9)"],
        borderWidth: 0,
      },
    ],
  };

  const lineOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { font: chartFont, color: "#64748b" }, grid: { display: false } },
      y: {
        ticks: { font: chartFont, color: "#64748b" },
        grid: { color: "rgba(148, 163, 184, 0.2)" },
        max: 100,
      },
    },
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { font: chartFont, color: "#64748b", maxRotation: 45 }, grid: { display: false } },
      y: {
        ticks: { font: chartFont, color: "#64748b", precision: 0 },
        grid: { color: "rgba(148, 163, 184, 0.2)" },
        beginAtZero: true,
      },
    },
  };

  return (
    <section className="space-y-4" aria-label="Analytics">
      <div className="grid gap-4 xl:grid-cols-2">
        <AnalyticsCard
          icon={TrendingUp}
          title="Occupancy trend"
          badge={badge}
          description="Monthly occupancy from reservation room-nights vs inventory."
        >
          <div className="h-[220px]">
            <Line data={occupancyData} options={lineOptions} />
          </div>
          <p className="mt-3 text-sm text-slate-600">
            Current occupancy: <span className="font-semibold text-slate-900">{analytics.occupancyRate}%</span>
            {" · "}
            Revenue today: <span className="font-semibold text-slate-900">{analytics.revenueToday}</span>
          </p>
        </AnalyticsCard>

        <AnalyticsCard
          icon={BarChart3}
          title="Available vs occupied"
          badge={badge}
          description="Keys available for sale vs in-house or reserved."
        >
          <div className="mx-auto h-[220px] max-w-[280px]">
            <Doughnut
              data={mixData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "bottom", labels: { font: chartFont } } },
              }}
            />
          </div>
        </AnalyticsCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsCard
          icon={BarChart3}
          title="Daily check-ins"
          badge={badge}
          description="Completed check-ins over the last 7 days (UTC)."
        >
          <div className="h-[200px]">
            <Bar data={checkInBar} options={barOptions} />
          </div>
        </AnalyticsCard>

        <AnalyticsCard
          icon={BarChart3}
          title="Daily check-outs"
          badge={badge}
          description="Completed check-outs over the last 7 days (UTC)."
        >
          <div className="h-[200px]">
            <Bar data={checkOutBar} options={barOptions} />
          </div>
        </AnalyticsCard>
      </div>
    </section>
  );
}
