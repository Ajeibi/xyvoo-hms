"use client";

import { useEffect, useState } from "react";
import { History, Search } from "lucide-react";
import { ACTIVITY_AREA_LABELS, ACTIVITY_AREAS, timeAgo } from "@/lib/store/activity-text";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput } from "./dashboard-ui";

type Entry = { id: string; area: string; actorName: string; sentence: string; details: string[]; createdAt: string };
type Result = { entries: Entry[]; total: number; page: number; pageSize: number; people: { id: string; name: string }[] };

const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";
const fullDate = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** The activity log: search and filters, then one sentence per change, newest first. */
export default function ActivityLog({ slug }: { slug: string }) {
  const [filters, setFilters] = useState({ q: "", area: "", person: "", from: "", to: "" });
  const [query, setQuery] = useState(filters);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  // Loading until the answer for the current search and page has arrived.
  const requestKey = JSON.stringify([slug, query, page]);
  const [loadedKey, setLoadedKey] = useState("");
  const loading = loadedKey !== requestKey;

  useEffect(() => {
    const params = new URLSearchParams({ slug, page: String(page) });
    for (const [k, v] of Object.entries(query)) if (v) params.set(k, v);
    let cancelled = false;
    fetch(`/api/store/activity?${params}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't load the activity log.");
        if (!cancelled) {
          setResult(data);
          setError("");
        }
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoadedKey(JSON.stringify([slug, query, page])));
    return () => {
      cancelled = true;
    };
  }, [slug, query, page]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(filters);
  };
  const clear = () => {
    const empty = { q: "", area: "", person: "", from: "", to: "" };
    setFilters(empty);
    setQuery(empty);
    setPage(1);
  };
  const filtered = Object.values(query).some(Boolean);
  const pages = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;
  const select = "w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-xyvoo-blue";

  return (
    <div className="space-y-6">
      <DashCard id="activity-filters" icon={Search} title="Find a change" description="Search by product, code or person, or narrow it down by area and date.">
        <form onSubmit={apply} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="search">
          <DashField id="activity-q" label="Search">
            <input id="activity-q" type="search" className={dashInput} value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="e.g. Linen Shirt" />
          </DashField>
          <DashField id="activity-area" label="Area">
            <select id="activity-area" className={select} value={filters.area} onChange={(e) => setFilters({ ...filters, area: e.target.value })}>
              <option value="">Everything</option>
              {ACTIVITY_AREAS.map((a) => (
                <option key={a} value={a}>
                  {ACTIVITY_AREA_LABELS[a]}
                </option>
              ))}
            </select>
          </DashField>
          <DashField id="activity-person" label="Person">
            <select id="activity-person" className={select} value={filters.person} onChange={(e) => setFilters({ ...filters, person: e.target.value })}>
              <option value="">Anyone</option>
              {(result?.people ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </DashField>
          <DashField id="activity-from" label="From">
            <input id="activity-from" type="date" className={dashInput} value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
          </DashField>
          <DashField id="activity-to" label="To">
            <input id="activity-to" type="date" className={dashInput} value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
          </DashField>
          <div className="flex items-end gap-2">
            <button type="submit" className={`${dashButton.primary} ${ring}`}>
              Show changes
            </button>
            {filtered ? (
              <button type="button" onClick={clear} className={`${dashButton.secondary} ${ring}`}>
                Clear
              </button>
            ) : null}
          </div>
        </form>
      </DashCard>

      <DashAlert message={error} />

      <section aria-labelledby="activity-list-title" aria-busy={loading}>
        <h2 id="activity-list-title" className="sr-only">
          Changes
        </h2>
        <p role="status" className="mb-3 text-sm text-slate-600">
          {loading ? "Loading changes…" : result ? `${result.total.toLocaleString("en-GB")} ${result.total === 1 ? "change" : "changes"}${filtered ? " match" : ""}` : ""}
        </p>
        {result && !result.entries.length && !loading ? (
          <DashEmptyState
            icon={History}
            title={filtered ? "No changes match" : "Nothing changed yet"}
            description={filtered ? "Try a different search, area or date." : "When you or your team change prices, products, settings or the team, it shows here."}
          />
        ) : (
          <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
            {(result?.entries ?? []).map((e) => (
              <li key={e.id} className="px-5 py-4">
                <p className="text-sm text-slate-900">
                  {e.sentence}
                  <span className="text-slate-500">
                    {" · "}
                    <time dateTime={e.createdAt} title={fullDate(e.createdAt)}>
                      {timeAgo(e.createdAt)}
                    </time>
                  </span>
                </p>
                {e.details.length > 1 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                    {e.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
        )}
        {pages > 1 ? (
          <nav aria-label="Pages of changes" className="mt-4 flex items-center justify-between gap-3">
            <button type="button" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)} className={`${dashButton.secondary} ${ring}`}>
              Newer
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {pages}
            </span>
            <button type="button" disabled={page >= pages || loading} onClick={() => setPage(page + 1)} className={`${dashButton.secondary} ${ring}`}>
              Older
            </button>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
