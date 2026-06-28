"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Analytics = {
  avgCompletionMinutes: number | null;
  byCategory: Record<string, number>;
  byDepartment: Record<string, number>;
  delayedOpen: number;
  totalSampled: number;
  topRequestTypes?: { requestType: string; count: number }[];
  byAssignee?: { userId: string; name: string; count: number }[];
};

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Service analytics (sample)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-slate-500">Avg completion (min)</p>
            <p className="text-lg font-semibold">{data.avgCompletionMinutes ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Delayed open</p>
            <p className="text-lg font-semibold text-red-700">{data.delayedOpen}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Requests sampled</p>
            <p className="text-lg font-semibold">{data.totalSampled}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Top categories</p>
            <ul className="mt-1 text-xs text-slate-600">
              {Object.entries(data.byCategory)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([k, v]) => (
                  <li key={k}>
                    {k.replace(/_/g, " ")}: {v}
                  </li>
                ))}
            </ul>
          </div>
        </div>
        {topTypes.length > 0 || byAssignee.length > 0 ? (
          <div className="grid gap-4 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2">
            {topTypes.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-slate-500">Top request types</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {topTypes.map((row) => (
                    <li key={row.requestType} className="flex justify-between gap-2">
                      <span className="truncate">{row.requestType}</span>
                      <span className="shrink-0 tabular-nums font-medium">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {byAssignee.length > 0 ? (
              <div>
                <p className="text-xs font-medium text-slate-500">By assignee</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {byAssignee.map((row) => (
                    <li key={row.userId} className="flex justify-between gap-2">
                      <span className="truncate">{row.name}</span>
                      <span className="shrink-0 tabular-nums font-medium">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
