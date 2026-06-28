"use client";

import { useState } from "react";
import {
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
import { Wallet } from "lucide-react";
import { Line } from "react-chartjs-2";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import {
  type FinanceMetric,
  type FinancePeriod,
  type FinancialBase,
  buildFinancialTrendViews,
} from "./mock-data";
import {
  AnalyticsCard,
  MetricTile,
  capitalize,
  formatCompactAmount,
  sumValues,
} from "./shared";

ChartJS.register(CategoryScale, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip);

type FinanceMetricConfig = {
  label: string;
  shortLabel: string;
  tabLabel: string;
  description: string;
  borderColor: string;
  backgroundColor: string;
  fill: boolean;
};

export default function FinancialPerformanceSection({
  currency,
  financialBase,
  badge = "Preview",
}: {
  currency: string;
  financialBase: FinancialBase;
  badge?: string | null;
}) {
  const [financeMetric, setFinanceMetric] = useState<FinanceMetric>("revenue");
  const [financePeriod, setFinancePeriod] = useState<FinancePeriod>("week");

  const financialTrendViews = buildFinancialTrendViews(financialBase);
  const activeFinancialView = financialTrendViews[financePeriod];
  const activeFinancialSeries = activeFinancialView.metrics[financeMetric];
  const activeMetricConfig = getFinanceMetricConfig(financeMetric);
  const activeMetricCurrent =
    activeFinancialSeries[activeFinancialSeries.length - 1] ??
    (financeMetric === "occupancy" ? financialBase.occupancyRate : 0);
  const activeMetricAverage = Math.round(
    sumValues(activeFinancialSeries) / Math.max(activeFinancialSeries.length, 1),
  );
  const activeMetricPeak = activeFinancialSeries.length ? Math.max(...activeFinancialSeries) : 0;
  const activeMetricStart = activeFinancialSeries[0] ?? 0;
  const activeMetricTotal = sumValues(activeFinancialSeries);
  const activeMetricChange = activeMetricCurrent - activeMetricStart;
  const activeMetricChangePercent =
    activeMetricStart > 0 ? Math.round((activeMetricChange / activeMetricStart) * 100) : 0;
  const useAggregatePrimaryMetric =
    financeMetric === "revenue" || financeMetric === "expenses" || financeMetric === "profit";

  const financialHighlights = [
    {
      label: useAggregatePrimaryMetric
        ? `${capitalize(financePeriod)} total`
        : `Latest ${activeMetricConfig.shortLabel}`,
      value: formatFinanceMetricValue(
        financeMetric,
        useAggregatePrimaryMetric ? activeMetricTotal : activeMetricCurrent,
        currency,
      ),
      description: activeFinancialView.summary,
    },
    {
      label: "Average",
      value: formatFinanceMetricValue(financeMetric, activeMetricAverage, currency),
      description: `Average ${activeMetricConfig.shortLabel.toLowerCase()} per ${activeFinancialView.unitLabel}.`,
    },
    {
      label: "Peak",
      value: formatFinanceMetricValue(financeMetric, activeMetricPeak, currency),
      description: `Highest ${activeMetricConfig.shortLabel.toLowerCase()} recorded in this ${financePeriod} view.`,
    },
    {
      label: "Change",
      value: formatFinanceMetricDelta(financeMetric, activeMetricChange, currency),
      description: `${activeMetricChange >= 0 ? "Up" : "Down"} ${Math.abs(activeMetricChangePercent)}% from the first ${activeFinancialView.unitLabel} in the selected view.`,
    },
  ];

  const financialLineChartData = {
    labels: activeFinancialView.labels,
    datasets: [
      {
        label: activeMetricConfig.label,
        data: activeFinancialSeries,
        borderColor: activeMetricConfig.borderColor,
        backgroundColor: activeMetricConfig.backgroundColor,
        fill: activeMetricConfig.fill,
        tension: 0.35,
        pointRadius: 0,
        pointHitRadius: 18,
        pointHoverRadius: 6,
        borderWidth: 3,
      },
    ],
  };

  const financialChartOptions: ChartOptions<"line"> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index",
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: "index",
        intersect: false,
        callbacks: {
          label(tooltipItem: TooltipItem<"line">) {
            return `${tooltipItem.dataset.label}: ${formatFinanceMetricValue(
              financeMetric,
              tooltipItem.parsed.y ?? 0,
              currency,
            )}`;
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
        beginAtZero: financeMetric !== "profit",
        max: financeMetric === "occupancy" ? 100 : undefined,
        ticks: {
          color: "#94a3b8",
          stepSize: financeMetric === "occupancy" ? 20 : undefined,
          callback(value: string | number) {
            return formatFinanceMetricAxisValue(financeMetric, Number(value), currency);
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
      icon={Wallet}
      title="Financial Performance"
      badge={badge}
      description="KPIs from live folio charges and payments; trend tabs still use illustrative curves scaled from today's revenue anchor."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {(
            ["revenue", "occupancy", "adr", "revpar", "expenses", "profit"] as FinanceMetric[]
          ).map((metric) => (
            <button
              key={metric}
              type="button"
              onClick={() => setFinanceMetric(metric)}
              className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                financeMetric === metric
                  ? "bg-blue-50 text-blue-600 shadow-sm shadow-blue-100"
                  : "bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {getFinanceMetricConfig(metric).tabLabel}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-900">
              {activeMetricConfig.label} update by {financePeriod}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-500">
              {activeMetricConfig.description}
            </p>
          </div>

          <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-50 p-1">
            {(["day", "week", "month", "quarter"] as FinancePeriod[]).map((period) => (
              <button
                key={period}
                type="button"
                onClick={() => setFinancePeriod(period)}
                className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  financePeriod === period
                    ? "bg-white text-blue-600 shadow-sm shadow-slate-200/70"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {capitalize(period)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-4">
          <div className="h-[360px]">
            <Line data={financialLineChartData} options={financialChartOptions} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {financialHighlights.map((item) => (
            <MetricTile key={item.label} {...item} />
          ))}
        </div>
      </div>
    </AnalyticsCard>
  );
}

function getFinanceMetricConfig(metric: FinanceMetric): FinanceMetricConfig {
  const configs = {
    revenue: {
      label: "Revenue",
      shortLabel: "Revenue",
      tabLabel: "Revenue",
      description: "Track top-line commercial intake for the selected period.",
      borderColor: "rgba(16, 185, 129, 0.95)",
      backgroundColor: "rgba(16, 185, 129, 0.14)",
      fill: true,
    },
    occupancy: {
      label: "Occupancy Rate",
      shortLabel: "Occupancy",
      tabLabel: "Occupancy",
      description: "See how room sell-through is trending over time.",
      borderColor: "rgba(14, 116, 144, 0.95)",
      backgroundColor: "rgba(14, 116, 144, 0.12)",
      fill: false,
    },
    adr: {
      label: "Average Daily Rate (ADR)",
      shortLabel: "ADR",
      tabLabel: "ADR",
      description: "Monitor how the average sold-room rate is moving.",
      borderColor: "rgba(124, 58, 237, 0.95)",
      backgroundColor: "rgba(124, 58, 237, 0.12)",
      fill: false,
    },
    revpar: {
      label: "RevPAR",
      shortLabel: "RevPAR",
      tabLabel: "RevPAR",
      description: "View revenue per available room across the selected horizon.",
      borderColor: "rgba(8, 145, 178, 0.95)",
      backgroundColor: "rgba(8, 145, 178, 0.12)",
      fill: true,
    },
    expenses: {
      label: "Expenses",
      shortLabel: "Expenses",
      tabLabel: "Expenses",
      description: "Track operating cost movement and watch expense pressure build over time.",
      borderColor: "rgba(245, 158, 11, 0.95)",
      backgroundColor: "rgba(245, 158, 11, 0.14)",
      fill: true,
    },
    profit: {
      label: "Profit",
      shortLabel: "Profit",
      tabLabel: "Profit",
      description: "Follow net operating performance after mock expense allocations.",
      borderColor: "rgba(4, 120, 87, 0.95)",
      backgroundColor: "rgba(4, 120, 87, 0.16)",
      fill: true,
    },
  };

  return configs[metric];
}

function formatFinanceMetricValue(metric: FinanceMetric, value: number, currency: string) {
  if (metric === "occupancy") {
    return `${Math.round(value)}%`;
  }

  return formatPricingAmount(value, currency);
}

function formatFinanceMetricDelta(metric: FinanceMetric, value: number, currency: string) {
  const prefix = value > 0 ? "+" : value < 0 ? "-" : "";
  const absoluteValue = Math.abs(value);

  if (metric === "occupancy") {
    return `${prefix}${Math.round(absoluteValue)} pts`;
  }

  return `${prefix}${formatPricingAmount(absoluteValue, currency)}`;
}

function formatFinanceMetricAxisValue(metric: FinanceMetric, amount: number, currency: string) {
  if (!Number.isFinite(amount)) return "0";

  if (metric === "occupancy") {
    return `${Math.round(amount)}%`;
  }

  return formatCompactAmount(amount, currency);
}
