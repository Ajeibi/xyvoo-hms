"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import type { GuestDirectoryPayload, GuestDirectoryRow } from "@/lib/hms/guests-directory";

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

function matchesSearch(row: GuestDirectoryRow, q: string) {
  const needle = q.toLowerCase();
  return (
    row.displayName.toLowerCase().includes(needle) ||
    row.phone.toLowerCase().includes(needle) ||
    row.email.toLowerCase().includes(needle) ||
    row.tags.some((t) => t.toLowerCase().includes(needle))
  );
}

export function GuestsDirectoryClient({ slug, initial }: { slug: string; initial: GuestDirectoryPayload }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const q = search.trim();
    return initial.rows.filter((r) => {
      if (vipOnly && !r.isVip) return false;
      if (q && !matchesSearch(r, q)) return false;
      return true;
    });
  }, [initial.rows, search, vipOnly]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / GUESTS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => filteredRows.slice((currentPage - 1) * GUESTS_PAGE_SIZE, currentPage * GUESTS_PAGE_SIZE),
    [filteredRows, currentPage],
  );

  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Guests</h1>
      <p className="mt-0.5 text-sm text-slate-500">Guest profiles and stay history</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Total guests" value={initial.summary.totalGuests} />
        <SummaryCard label="VIP" value={initial.summary.vipGuests} />
        <SummaryCard label="With open requests" value={initial.summary.withOpenRequests} />
        <SummaryCard label="Repeat guests" value={initial.summary.repeatGuests} subtitle="More than one stay" />
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Search</p>
          <Input
            className="max-w-xs"
            placeholder="Name, phone, email, tag…"
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
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredRows.length === 0 ? (
          <p className="p-16 text-center text-sm text-slate-500">
            {initial.rows.length === 0 ? "No guests yet." : "No guests match your filters."}
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
              {pageRows.map((g) => (
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

      {filteredRows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {(currentPage - 1) * GUESTS_PAGE_SIZE + 1}–
            {Math.min(currentPage * GUESTS_PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              Previous
            </Button>
            <span className="px-2 text-xs font-medium text-slate-500">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
