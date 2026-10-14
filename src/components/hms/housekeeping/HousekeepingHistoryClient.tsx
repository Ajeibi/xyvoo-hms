"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
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
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Housekeeping"
        meaning="care"
        title="History"
        description="Every room that's been cleaned, inspected and approved, most recent first."
      />

      <HousekeepingSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="max-w-sm">
        <HmsField id="hk-history-search" label="Search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              id="hk-history-search"
              type="search"
              className={`${hmsInput} pl-9`}
              placeholder="Room or staff name"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </HmsField>
      </div>

      {filteredRows.length === 0 ? (
        <HmsEmptyState
          art="page"
          meaning="care"
          title={rows.length === 0 ? "No completed rooms yet" : "No rooms match your search"}
          description={
            rows.length === 0
              ? "Rooms appear here once they've been cleaned and passed inspection."
              : "Try a different room number or name."
          }
        />
      ) : (
        <HmsCard flush>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Completed housekeeping tasks</caption>
              <thead className="bg-violet-50/60">
                <tr className="text-sm text-slate-700">
                  <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Room</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Task</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Assigned to</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Completed</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Inspected by</th>
                  <th scope="col" className="py-3 pr-6 text-right font-semibold">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="whitespace-nowrap py-3 pl-6 pr-4 font-medium text-slate-900">Room {r.roomCode}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-700">{taskTypeLabel(r.taskType)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-700">{r.assignedNote ?? "—"}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-700">
                      {r.completedAt ? formatBoardDateTime(r.completedAt) : "—"}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-700">
                      {r.inspectedByName ?? "—"}
                      {r.inspectedAt ? (
                        <span className="ml-1 text-xs text-slate-600">· {formatBoardDateTime(r.inspectedAt)}</span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-6 text-right">
                      {/* Only inspection-passed tasks ever reach `ready`; a fail sends the room back to
                          dirty for rework, so every row here is, by definition, an approved room. */}
                      <HmsPill tone="green">Passed</HmsPill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HmsCard>
      )}

      {filteredRows.length > 0 ? (
        <nav aria-label="History pages" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
          <p>
            Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredRows.length)} of{" "}
            {filteredRows.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={hmsButton.secondary}
              disabled={currentPage <= 1}
              onClick={() => setPage(Math.max(1, currentPage - 1))}
            >
              Previous
            </button>
            <span className="px-2 text-sm font-medium text-slate-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              className={hmsButton.secondary}
              disabled={currentPage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </HmsPage>
  );
}
