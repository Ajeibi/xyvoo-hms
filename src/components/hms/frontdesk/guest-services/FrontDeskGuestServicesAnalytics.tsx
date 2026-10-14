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
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
        {items.map((row) => (
          <li key={row.key} className="flex justify-between gap-2">
            <span className="truncate capitalize">{row.label}</span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">{row.count}</span>
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
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
        <HmsStatTile label="Requests looked at" value={data.totalSampled} icon={ListChecks} meaning="guests" />
      </div>
      {topCategories.length > 0 || topTypes.length > 0 || byAssignee.length > 0 ? (
        <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3">
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
