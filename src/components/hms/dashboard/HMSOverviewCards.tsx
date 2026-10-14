import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HmsStatTile } from "@/components/hms/dashboard-tiles";
import type { HmsMeaning } from "@/components/hms/meaning";

type DashboardIcon = React.ComponentType<{ className?: string }>;

type HeroStat = {
  icon: DashboardIcon;
  label: string;
  value: string;
  description: string;
  meaning: HmsMeaning;
};

type OverviewMetric = {
  icon: DashboardIcon;
  label: string;
  value: string;
  description: string;
  meaning: HmsMeaning;
};

export default function HMSOverviewCards({
  hotelName,
  actionHref,
  summaryItems,
  metrics,
}: {
  hotelName: string;
  actionHref: string;
  summaryItems: HeroStat[];
  metrics: OverviewMetric[];
}) {
  const orderedCards = [
    ...summaryItems.slice(0, 2),
    ...metrics.slice(0, 2),
    ...summaryItems.slice(2),
    ...metrics.slice(2),
  ];

  return (
    <div className="space-y-6">
      <section
        data-tour="dashboard-header"
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-white to-sky-50/70 shadow-sm"
      >
        <div className="px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
                Dashboard Overview
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                HMS Dashboard
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Operational snapshot for {hotelName}. Your room setup is already powering
                the dashboard, while the next layer of analytics and departmental insight
                is staged here for rollout.
              </p>
            </div>

            <Link
              href={actionHref}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100"
            >
              Manage setup
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div data-tour="dashboard-kpis" className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {orderedCards.map(({ icon, label, value, description, meaning }) => (
              <HmsStatTile key={label} icon={icon} label={label} value={value} hint={description} meaning={meaning} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

