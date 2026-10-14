"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, MessageSquareText, Repeat, Search, SearchX, Users } from "lucide-react";
import {
  HmsCard,
  HmsEmptyState,
  HmsPage,
  HmsPageHeader,
  HmsPill,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import type { GuestDirectoryPayload } from "@/lib/hms/guests-directory";

const GUESTS_PAGE_SIZE = 5;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function Nothing() {
  return (
    <span className="text-slate-600">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
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
  const noGuestsAtAll = payload.total === 0 && !search.trim() && !vipOnly;

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Guests"
        meaning="guests"
        title="Guests"
        description="Everyone who has stayed with you, with their contact details and stay history."
      />

      <HmsSectionIntro
        id="guests"
        meaning="guests"
        art="people"
        title="Get to know your guests"
        points={[
          "A guest is added here when they book or check in, so returning guests are easy to recognise.",
          "Open a guest to see their past stays, what they've spent and any notes your team has made.",
          "Mark someone as a VIP or add a note so the whole team knows the little things.",
        ]}
      />

      <HmsStatStrip label="Your guests in figures">
        <HmsStatTile label="Guests" value={payload.summary.totalGuests} icon={Users} meaning="guests" hint="Everyone on record" />
        <HmsStatTile label="VIP guests" value={payload.summary.vipGuests} icon={Crown} meaning="guests" hint="Marked for extra care" />
        <HmsStatTile
          label="With open requests"
          value={payload.summary.withOpenRequests}
          icon={MessageSquareText}
          meaning="guests"
          hint="Waiting on the team"
        />
        <HmsStatTile label="Came back" value={payload.summary.repeatGuests} icon={Repeat} meaning="guests" hint="More than one stay" />
      </HmsStatStrip>

      <div className="space-y-3">
        <div className="max-w-md">
          <label htmlFor="guests-search" className="mb-1 block text-sm font-medium text-slate-800">
            Search guests
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
            <input
              id="guests-search"
              type="search"
              className={`${hmsInput} pl-10`}
              placeholder="Name, phone or email"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <HmsFilterChips
            label="Show"
            meaning="guests"
            options={[
              { value: "all", label: "Everyone", count: payload.summary.totalGuests },
              { value: "vip", label: "VIP only", count: payload.summary.vipGuests },
            ]}
            value={vipOnly ? "vip" : "all"}
            onChange={(v) => {
              setVipOnly(v === "vip");
              setPage(1);
            }}
          />
          <span role="status" className="text-sm text-slate-600">
            {loading ? "Searching…" : ""}
          </span>
        </div>
      </div>

      <HmsCard
        id="guests-list"
        icon={Users}
        meaning="guests"
        title="Your guests"
        description="Open a guest to see their stays, their bills and notes about them."
        flush
      >
        {payload.rows.length === 0 ? (
          noGuestsAtAll ? (
            <HmsEmptyState
              bare
              art="people"
              meaning="guests"
              title="No guests yet"
              description="Guests appear here after their first booking or check-in, with their stays and notes in one place."
            />
          ) : (
            <HmsEmptyState
              bare
              icon={SearchX}
              meaning="guests"
              title="No guests match"
              description="Try a different name, phone number or email, or show everyone."
              action={
                <button
                  type="button"
                  className={`${hmsButton.secondary} ${focusRing}`}
                  onClick={() => {
                    setSearch("");
                    setVipOnly(false);
                    setPage(1);
                  }}
                >
                  Show everyone
                </button>
              }
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Guests, {payload.total} found</caption>
              <thead className="bg-slate-50 text-sm text-slate-700">
                <tr>
                  <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Name</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Contact</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Tags</th>
                  <th scope="col" className="py-3 pr-4 text-center font-semibold">Stays</th>
                  <th scope="col" className="py-3 pr-4 text-center font-semibold">Open requests</th>
                  <th scope="col" className="py-3 pr-6 font-semibold">Last stay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payload.rows.map((g) => (
                  <tr
                    key={g.id}
                    className="cursor-pointer transition-colors hover:bg-amber-50/40"
                    onClick={() => router.push(`/hms/${slug}/guests/${g.id}`)}
                  >
                    <td className="whitespace-nowrap py-3 pl-6 pr-4">
                      <Link
                        href={`/hms/${slug}/guests/${g.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className={`rounded font-medium text-slate-900 hover:text-blue-700 hover:underline ${focusRing}`}
                      >
                        {g.displayName}
                      </Link>
                      {g.isVip ? (
                        <span className="ml-2">
                          <HmsPill tone="amber">VIP</HmsPill>
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-700">
                      {g.phone}
                      <br />
                      {g.email}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {g.tags.length > 0 ? (
                        <span className="flex flex-wrap gap-1">
                          {g.tags.map((t) => (
                            <HmsPill key={t}>{t}</HmsPill>
                          ))}
                        </span>
                      ) : (
                        <Nothing />
                      )}
                    </td>
                    <td className="py-3 pr-4 text-center tabular-nums text-slate-700">{g.visitCount}</td>
                    <td className="py-3 pr-4 text-center">
                      {g.openRequestCount > 0 ? <HmsPill tone="amber">{g.openRequestCount} open</HmsPill> : <Nothing />}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-6 text-slate-700">
                      {g.lastStayAt ? formatBoardDateTime(g.lastStayAt) : <Nothing />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      {payload.total > 0 ? (
        <nav aria-label="Pages of guests" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
          <p>
            Showing {(page - 1) * GUESTS_PAGE_SIZE + 1} to {Math.min(page * GUESTS_PAGE_SIZE, payload.total)} of {payload.total}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
              disabled={page <= 1}
              onClick={() => setPage(Math.max(1, page - 1))}
            >
              Previous
            </button>
            <span className="px-2 text-sm font-medium text-slate-700">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`}
              disabled={page >= totalPages}
              onClick={() => setPage(Math.min(totalPages, page + 1))}
            >
              Next
            </button>
          </div>
        </nav>
      ) : null}
    </HmsPage>
  );
}
