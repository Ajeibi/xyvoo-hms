"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import type { HousekeepingHistoryRow } from "@/lib/hms/housekeeping-tasks";
import { taskTypeLabel } from "@/components/hms/housekeeping/HousekeepingBadges";
import { HousekeepingSubNav } from "@/components/hms/housekeeping/HousekeepingSubNav";

const PAGE_SIZE = 15;

function matchesSearch(row: HousekeepingHistoryRow, q: string) {
  const needle = q.toLowerCase();
  return (
    row.roomCode.toLowerCase().includes(needle) ||
    (row.assignedNote ?? "").toLowerCase().includes(needle) ||
    (row.inspectedByName ?? "").toLowerCase().includes(needle)
  );
}

export function HousekeepingHistoryClient({
  slug,
  rows,
  canAccessAllDepartments,
}: {
  slug: string;
  rows: HousekeepingHistoryRow[];
  canAccessAllDepartments: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
    const q = search.trim();
    return q ? rows.filter((r) => matchesSearch(r, q)) : rows;
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">History</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Every room that&apos;s been cleaned, inspected, and approved — most recent first.
      </p>

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Search</p>
          <Input
            className="max-w-xs"
            placeholder="Room or staff name…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {filteredRows.length === 0 ? (
          <p className="p-16 text-center text-sm text-slate-500">
            {rows.length === 0 ? "No completed rooms yet." : "No rooms match your search."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-400">
                  <th className="py-3 pl-6 pr-4 font-medium">Room</th>
                  <th className="py-3 pr-4 font-medium">Task</th>
                  <th className="py-3 pr-4 font-medium">Assigned to</th>
                  <th className="py-3 pr-4 font-medium">Completed</th>
                  <th className="py-3 pr-4 font-medium">Inspected by</th>
                  <th className="py-3 pr-6 text-right font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap py-3 pl-6 pr-4 font-medium text-slate-900">Room {r.roomCode}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-600">{taskTypeLabel(r.taskType)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-600">{r.assignedNote ?? "—"}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-600">
                      {r.completedAt ? formatBoardDateTime(r.completedAt) : "—"}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-600">
                      {r.inspectedByName ?? "—"}
                      {r.inspectedAt ? (
                        <span className="ml-1 text-xs text-slate-400">· {formatBoardDateTime(r.inspectedAt)}</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-6 text-right">
                      {/* Only inspection-passed tasks ever reach `ready` — a fail sends the room back to
                          dirty for rework, so every row here is, by definition, an approved room. */}
                      <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                        Passed
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {filteredRows.length > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of{" "}
            {filteredRows.length}
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
