import Link from "next/link";
import { ArrowRight } from "lucide-react";

type DashboardIcon = React.ComponentType<{ className?: string }>;

type HeroStat = {
  icon: DashboardIcon;
  label: string;
  value: string;
  description: string;
};

type OverviewMetric = {
  icon: DashboardIcon;
  label: string;
  value: string;
  description: string;
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
        className="overflow-hidden rounded-[28px] border border-slate-200 bg-white"
      >
        <div className="px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                Dashboard Overview
              </p>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                HMS Dashboard
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">
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

          <div data-tour="dashboard-kpis" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {orderedCards.map(({ icon: Icon, label, value, description }) => (
              <SnapshotCard
                key={label}
                icon={Icon}
                label={label}
                value={value}
                description={description}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function SnapshotCard({
  icon: Icon,
  label,
  value,
  description,
}: {
  icon: DashboardIcon;
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm shadow-slate-200/40">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <Icon className="h-5 w-5" />
      </div>

      <div className="mt-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}
