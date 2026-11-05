"use client";

import { useEffect, useState } from "react";
import { BarChart3, Clock, ListChecks, Timer } from "lucide-react";
import { HmsCard, HmsStatTile } from "@/components/hms/hms-ui";

type Analytics = {
  avgCompletionMinutes: number | null;
  byCategory: Record<string, number>;
  byDepartment: Record<string, number>;
  delayedOpen: number;
  totalSampled: number;
  topRequestTypes?: { requestType: string; count: number }[];
  byAssignee?: { userId: string; name: string; count: number }[];
};

function CountList({ title, items }: { title: string; items: { key: string; label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <ul className="mt-3 space-y-3 text-sm text-slate-700">
        {items.map((row) => (
          <li key={row.key}>
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate capitalize">{row.label}</span>
              <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-900 ring-1 ring-slate-200">
                {row.count}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-200" aria-hidden>
              <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.max(6, (row.count / max) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FrontDeskGuestServicesAnalytics({ slug }: { slug: string }) {
  const [data, setData] = useState<Analytics | null>(null);

  useEffect(() => {
    fetch(`/api/hotel/frontdesk/guest-services/analytics?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.error) setData(d);
      })
      .catch(() => setData(null));
  }, [slug]);

  if (!data) return null;

  const topTypes = data.topRequestTypes ?? [];
  const byAssignee = data.byAssignee ?? [];
  const topCategories = Object.entries(data.byCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  return (
    <HmsCard
      id="guest-services-insights"
      icon={BarChart3}
      meaning="guests"
      title="How requests are going"
      description={`Based on the latest ${data.totalSampled} ${data.totalSampled === 1 ? "request" : "requests"}.`}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <HmsStatTile
          label="Average time to finish"
          value={data.avgCompletionMinutes != null ? `${data.avgCompletionMinutes} min` : "Not enough data"}
          icon={Timer}
          meaning="guests"
        />
        <HmsStatTile
          label="Open and running late"
          value={data.delayedOpen}
          icon={Clock}
          meaning="attention"
          hint="Nothing running late"
          status={data.delayedOpen > 0 ? "critical" : undefined}
          statusText="Needs someone now"
        />
        <div className="sm:col-span-2 lg:col-span-1 [&>*]:h-full">
          <HmsStatTile label="Requests looked at" value={data.totalSampled} icon={ListChecks} meaning="guests" />
        </div>
      </div>
      {topCategories.length > 0 || topTypes.length > 0 || byAssignee.length > 0 ? (
        <div className="mt-5 grid grid-cols-1 gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
          {topCategories.length > 0 ? (
            <CountList title="Most asked-for kinds" items={topCategories.map(([k, v]) => ({ key: k, label: k.replace(/_/g, " "), count: v }))} />
          ) : null}
          {topTypes.length > 0 ? (
            <CountList title="Most common requests" items={topTypes.map((r) => ({ key: r.requestType, label: r.requestType, count: r.count }))} />
          ) : null}
          {byAssignee.length > 0 ? (
            <CountList title="Handled by" items={byAssignee.map((r) => ({ key: r.userId, label: r.name, count: r.count }))} />
          ) : null}
        </div>
      ) : null}
    </HmsCard>
  );
}
