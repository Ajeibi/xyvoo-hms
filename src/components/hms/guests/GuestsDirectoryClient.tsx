"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import type { GuestDirectoryPayload } from "@/lib/hms/guests-directory";

const GUESTS_PAGE_SIZE = 5;

function SummaryCard({ label, value, subtitle }: { label: string; value: number; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {subtitle ? <p className="mt-1 text-[11px] leading-snug text-slate-500">{subtitle}</p> : null}
    </div>
  );
}

export function GuestsDirectoryClient({ slug, initial }: { slug: string; initial: GuestDirectoryPayload }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState(initial);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Skip the very first render — `initial` already reflects page 1 with no filters.
    if (page === 1 && !search.trim() && !vipOnly && payload === initial) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ slug, page: String(page), pageSize: String(GUESTS_PAGE_SIZE) });
      if (search.trim()) params.set("q", search.trim());
      if (vipOnly) params.set("vipOnly", "true");
      fetch(`/api/hotel/guests?${params}`)
        .then((r) => r.json())
        .then((data: GuestDirectoryPayload & { error?: string }) => {
          if (!data.error) setPayload(data);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `initial`/`payload` are reference checks, not dependencies to react to
  }, [slug, search, vipOnly, page]);

  const totalPages = Math.max(1, Math.ceil(payload.total / GUESTS_PAGE_SIZE));

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Guests</h1>
      <p className="mt-0.5 text-sm text-slate-500">Guest profiles and stay history</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total guests" value={payload.summary.totalGuests} />
        <SummaryCard label="VIP" value={payload.summary.vipGuests} />
        <SummaryCard label="With open requests" value={payload.summary.withOpenRequests} />
        <SummaryCard label="Repeat guests" value={payload.summary.repeatGuests} subtitle="More than one stay" />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Search</p>
          <Input
            className="max-w-xs"
            placeholder="Name, phone, email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <label className="mb-0.5 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={vipOnly}
            onChange={(e) => {
              setVipOnly(e.target.checked);
              setPage(1);
            }}
          />
          VIP only
        </label>
        {loading ? <span className="mb-0.5 text-xs text-slate-400">Searching…</span> : null}
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {payload.rows.length === 0 ? (
          <p className="p-16 text-center text-sm text-slate-500">
            {payload.total === 0 && !search.trim() && !vipOnly ? "No guests yet." : "No guests match your filters."}
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-6 pr-4 font-medium">Name</th>
                <th className="py-3 pr-4 font-medium">Contact</th>
                <th className="py-3 pr-4 font-medium">Tags</th>
                <th className="py-3 pr-4 text-center font-medium">Visits</th>
                <th className="py-3 pr-4 text-center font-medium">Open requests</th>
                <th className="py-3 pr-6 font-medium">Last stay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payload.rows.map((g) => (
                <tr
                  key={g.id}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => router.push(`/hms/${slug}/guests/${g.id}`)}
                >
                  <td className="whitespace-nowrap py-3 pl-6 pr-4">
                    <span className="font-medium text-slate-900">{g.displayName}</span>
                    {g.isVip ? (
                      <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        VIP
                      </span>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-4 text-slate-600">
                    {g.phone}
                    <br />
                    {g.email}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {g.tags.length > 0 ? (
                      <span className="flex flex-wrap gap-1">
                        {g.tags.map((t) => (
                          <span
                            key={t}
                            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-center tabular-nums text-slate-700">{g.visitCount}</td>
                  <td className="py-3 pr-4 text-center">
                    {g.openRequestCount > 0 ? (
                      <span className="inline-flex rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700">
                        {g.openRequestCount} open
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-3 pr-6 text-slate-600">
                    {g.lastStayAt ? formatBoardDateTime(g.lastStayAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {payload.total > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {(page - 1) * GUESTS_PAGE_SIZE + 1}–{Math.min(page * GUESTS_PAGE_SIZE, payload.total)} of {payload.total}
          </p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(Math.max(1, page - 1))}>
              Previous
            </Button>
            <span className="px-2 text-xs font-medium text-slate-500">
              Page {page} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
