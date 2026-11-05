"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crown, Download, MessageSquareText, Plus, Repeat, Search, SearchX, UserPlus, Users } from "lucide-react";
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
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { GuestForm } from "@/components/hms/guests/GuestForm";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { EMPTY_GUEST_EDITABLE, type CompanyOption } from "@/lib/hms/guest-fields";
import type { GuestDirectoryPayload } from "@/lib/hms/guests-directory";

const PAGE_SIZES = [10, 25, 50] as const;

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

function Nothing() {
  return (
    <span className="text-slate-600">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
  );
}

export function GuestsDirectoryClient({
  slug,
  initial,
  initialSegment,
  segmentOptions,
  companies,
  canEdit,
}: {
  slug: string;
  initial: GuestDirectoryPayload;
  initialSegment: string;
  segmentOptions: { key: string; label: string }[];
  companies: CompanyOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [vipOnly, setVipOnly] = useState(false);
  const [segment, setSegment] = useState(initialSegment);
  const [pageSize, setPageSize] = useState<number>(10);
  const [page, setPage] = useState(1);
  const [payload, setPayload] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  useEffect(() => {
    // Skip the very first render: `initial` already shows page 1 for the starting filters.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setLoading(true);
      const params = new URLSearchParams({ slug, page: String(page), pageSize: String(pageSize) });
      if (search.trim()) params.set("q", search.trim());
      if (vipOnly) params.set("vipOnly", "true");
      if (segment) params.set("segment", segment);
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
  }, [slug, search, vipOnly, segment, page, pageSize]);

  const totalPages = Math.max(1, Math.ceil(payload.total / pageSize));
  const filtered = Boolean(search.trim() || vipOnly || segment);
  const noGuestsAtAll = payload.total === 0 && !filtered;
  const segmentLabel = segmentOptions.find((s) => s.key === segment)?.label;
  const exportHref = `/api/hotel/guests/segments/export?slug=${encodeURIComponent(slug)}${segment ? `&segment=${encodeURIComponent(segment)}` : ""}`;

  return (
    <HmsPage wide>
      <GuestsNav slug={slug} />
      <HmsPageHeader
        eyebrow="Guests"
        meaning="guests"
        title="Guests"
        description="Everyone who has stayed with you, with their contact details and stay history."
        actions={
          canEdit ? (
            <button type="button" className={hmsButton.primary} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              <Plus className="h-4 w-4" aria-hidden />
              Add a guest
            </button>
          ) : undefined
        }
      />

      {adding ? (
        <HmsCard id="guest-add" icon={UserPlus} meaning="guests" title="Add a guest" description="For someone who isn't checking in right now, like a past guest or a regular you want on file.">
          <GuestForm
            slug={slug}
            initial={EMPTY_GUEST_EDITABLE}
            companies={companies}
            onCancel={() => setAdding(false)}
            onSaved={(id) => {
              setAdding(false);
              if (id) router.push(`/hms/${slug}/guests/${id}`);
              else router.refresh();
            }}
          />
        </HmsCard>
      ) : null}

      <HmsSectionIntro
        id="guests"
        meaning="guests"
        art="people"
        title="Get to know your guests"
        points={[
          "A guest is added here when they book or check in, so returning guests are easy to recognise.",
          "Open a guest to see their past stays, what they've spent, their points and any notes your team has made.",
          "Use Segments to pick groups like big spenders or people who haven't been back, and Duplicates to join double entries.",
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label htmlFor="guests-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search guests
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
              <input
                id="guests-search"
                type="search"
                className={`${hmsInput} pl-10`}
                placeholder="Name, phone, email or ID number"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div>
            <label htmlFor="guests-segment" className="mb-1 block text-sm font-medium text-slate-800">
              Segment
            </label>
            <select
              id="guests-segment"
              className={hmsInput}
              value={segment}
              onChange={(e) => {
                setSegment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Everyone</option>
              {segmentOptions.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={vipOnly}
              onChange={(e) => {
                setVipOnly(e.target.checked);
                setPage(1);
              }}
            />
            VIP tag only
          </label>
          <span role="status" className="text-sm text-slate-600">
            {loading ? "Searching…" : ""}
          </span>
        </div>
      </div>

      <HmsCard
        id="guests-list"
        icon={Users}
        meaning="guests"
        title={segmentLabel ? segmentLabel : "Your guests"}
        description="Open a guest to see their stays, their bills and notes about them."
        actions={
          canEdit ? (
            <a className={hmsButton.small} href={exportHref} download>
              <Download className="h-4 w-4" aria-hidden />
              Download as a spreadsheet
            </a>
          ) : undefined
        }
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
              description="Try a different name, phone number, email or ID number, or show everyone."
              action={
                <button
                  type="button"
                  className={`${hmsButton.secondary} ${focusRing}`}
                  onClick={() => {
                    setSearch("");
                    setVipOnly(false);
                    setSegment("");
                    setPage(1);
                  }}
                >
                  Show everyone
                </button>
              }
            />
          )
        ) : (
          <>
          <ul className="divide-y divide-slate-100 md:hidden" aria-label={`Guests, ${payload.total} found`}>
            {payload.rows.map((g) => (
              <li
                key={g.id}
                className="space-y-3 px-3 py-3.5 transition-colors active:bg-amber-50/40"
                onClick={() => router.push(`/hms/${slug}/guests/${g.id}`)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/hms/${slug}/guests/${g.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className={`rounded text-base font-semibold leading-snug text-slate-900 hover:text-blue-700 hover:underline ${focusRing}`}
                    >
                      {g.displayName}
                    </Link>
                    {g.companyName ? <p className="mt-0.5 text-xs text-slate-600">{g.companyName}</p> : null}
                    {g.isVip || g.tier ? (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {g.isVip ? <HmsPill tone="amber">VIP</HmsPill> : null}
                        {g.tier ? <HmsPill tone="blue">{g.tier}</HmsPill> : null}
                      </div>
                    ) : null}
                  </div>
                  {g.openRequestCount > 0 ? <HmsPill tone="amber">{g.openRequestCount} open</HmsPill> : null}
                </div>

                {g.phone || g.email ? (
                  <div className="space-y-0.5 text-sm text-slate-700">
                    {g.phone ? <p>{g.phone}</p> : null}
                    {g.email ? <p className="break-all text-slate-600">{g.email}</p> : null}
                  </div>
                ) : null}

                {g.tags.length > 0 || g.canMarket ? (
                  <div className="flex flex-wrap gap-1.5">
                    {g.tags.map((t) => (
                      <HmsPill key={t}>{t}</HmsPill>
                    ))}
                    {g.canMarket ? <HmsPill tone="green">Offers OK</HmsPill> : null}
                  </div>
                ) : null}

                <dl className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-slate-50/80 p-3 text-sm ring-1 ring-slate-200/70">
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Stays</dt>
                    <dd className="mt-0.5 font-medium tabular-nums text-slate-900">{g.visitCount}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Spent</dt>
                    <dd className="mt-0.5 wrap-break-word font-medium tabular-nums text-slate-900">
                      {g.spend > 0 ? g.spend.toLocaleString("en-NG", { maximumFractionDigits: 0 }) : <Nothing />}
                    </dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">Last stay</dt>
                    <dd className="mt-0.5 text-slate-900">
                      {g.lastStayAt ? formatBoardDateTime(g.lastStayAt) : <Nothing />}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table data-no-stack className="w-full min-w-225 text-left text-sm">
              <caption className="sr-only">Guests, {payload.total} found</caption>
              <thead className="bg-slate-50 text-sm text-slate-700">
                <tr>
                  <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Name</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Contact</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Tags</th>
                  <th scope="col" className="py-3 pr-4 text-center font-semibold">Stays</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Spent</th>
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
                      {g.tier ? (
                        <span className="ml-2">
                          <HmsPill tone="blue">{g.tier}</HmsPill>
                        </span>
                      ) : null}
                      {g.companyName ? <p className="text-xs text-slate-600">{g.companyName}</p> : null}
                    </td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-700">
                      {g.phone || <Nothing />}
                      <br />
                      {g.email}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {g.tags.length > 0 || g.canMarket ? (
                        <span className="flex flex-wrap gap-1">
                          {g.tags.map((t) => (
                            <HmsPill key={t}>{t}</HmsPill>
                          ))}
                          {g.canMarket ? <HmsPill tone="green">Offers OK</HmsPill> : null}
                        </span>
                      ) : (
                        <Nothing />
                      )}
                    </td>
                    <td className="py-3 pr-4 text-center tabular-nums text-slate-700">{g.visitCount}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-right tabular-nums text-slate-700">
                      {g.spend > 0 ? g.spend.toLocaleString("en-NG", { maximumFractionDigits: 0 }) : <Nothing />}
                    </td>
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
          </>
        )}
      </HmsCard>

      {payload.total > 0 ? (
        <nav aria-label="Pages of guests" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-700">
          <p>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, payload.total)} of {payload.total}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="guests-page-size" className="text-sm text-slate-700">
              Per page
            </label>
            <select
              id="guests-page-size"
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
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
