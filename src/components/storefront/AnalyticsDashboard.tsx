"use client";

import { useEffect, useState } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { Banknote, BarChart3, Bell, Download, Eye, FileDown, FileText, Filter, Info, Loader2, Megaphone, Monitor, Package, Search, ShoppingBag, Smartphone, Tablet, Users, Wallet } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { DashAlert, DashCard, DashEmptyState, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, dashButton, dashInput } from "./dashboard-ui";
import { MEANING, type Meaning } from "./meaning";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend);

type Summary = {
  visitors: number;
  sessions: number;
  pageViews: number;
  productViews: number;
  searches: number;
  cartSessions: number;
  checkoutSessions: number;
  detailsSessions: number;
  paymentSessions: number;
  appSessions: number;
  appInstalls: number;
  orders: number;
  paidOrders: number;
  revenue: number;
};

type RangeKey = "today" | "7d" | "28d";

type AnalyticsData = {
  range: RangeKey | "custom";
  days: number;
  fromDate: string;
  toDate: string;
  canExport: boolean;
  currency: string;
  current: Summary;
  previous: Summary;
  daily: { day: string; visitors: number; paidOrders: number; revenue: number }[];
  products: { productId: string; name: string; views: number; cartAdds: number; unitsSold: number; revenue: number }[];
  sources: { source: string; sessions: number; checkoutSessions: number; paidOrders: number; revenue: number }[];
  devices: { device: string; isApp: boolean; sessions: number }[];
  notifications: { id: string; title: string; sentAt: string; delivered: number; opened: number }[];
};

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "28d", label: "Last 28 days" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  direct: "Direct (typed or bookmarked)",
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  x: "X (Twitter)",
  google: "Google",
  notification: "Your notifications",
  app: "Your app",
};

/** "YYYY-MM-DD" for a local date. */
const isoDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The first and last days of last month, for the "Last month" shortcut. */
function lastMonth(now = new Date()) {
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: isoDate(new Date(now.getFullYear(), now.getMonth(), 0)) };
}

const longDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

const DOWNLOADS = [
  { format: "sales-csv", label: "Sales (CSV)", hint: "One row per order: date, customer, items, discount, delivery, tax, total and payment." },
  { format: "daily-csv", label: "Daily totals (CSV)", hint: "Visitors, orders and sales for each day." },
  { format: "pdf", label: "Summary (PDF)", hint: "Headline figures, top products and the day-by-day table, ready to print or share." },
] as const;

/** Downloads of the chosen period (Standard plan). */
function Downloads({ slug, query, canExport, periodLabel }: { slug: string; query: string; canExport: boolean; periodLabel: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function download(format: string) {
    setBusy(format);
    setMessage("");
    try {
      const res = await fetch(`/api/store/analytics/export?slug=${encodeURIComponent(slug)}&format=${format}&${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(typeof body.error === "string" ? body.error : "We couldn't prepare your download just now. Please try again.");
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "")?.[1] || "analytics";
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
      setMessage(`Downloaded ${name}.`);
    } catch {
      setMessage("We couldn't prepare your download. Please check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashCard id="an-downloads" icon={Download} meaning="money" title="Download this period" description={`Reports for ${periodLabel}, to keep for your records or share with your accountant.`}>
      {canExport ? (
        <>
          <ul className="grid gap-3 sm:grid-cols-3">
            {DOWNLOADS.map((d) => (
              <li key={d.format} className="flex flex-col items-start gap-2 rounded-xl bg-emerald-50/70 p-4">
                <button
                  type="button"
                  onClick={() => download(d.format)}
                  disabled={busy !== null}
                  aria-busy={busy === d.format}
                  aria-describedby={`an-dl-${d.format}`}
                  className={`${dashButton.secondary} ${focusRing}`}
                >
                  {busy === d.format ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
                  {busy === d.format ? "Preparing…" : d.label}
                </button>
                <p id={`an-dl-${d.format}`} className="text-xs text-slate-600">
                  {d.hint}
                </p>
              </li>
            ))}
          </ul>
          <p role="status" className="mt-3 text-sm text-slate-700">
            {message}
          </p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-blue-50 px-4 py-3">
          <p className="text-sm text-slate-800">Downloading your sales as a spreadsheet or PDF is part of the Standard plan.</p>
          <a href={`/storefront/${encodeURIComponent(slug)}/payments`} className={`${dashButton.primary} ${focusRing}`}>
            See the Standard plan
          </a>
        </div>
      )}
    </DashCard>
  );
}

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);
const number = (v: number) => v.toLocaleString("en-GB");

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";
const pulse = "animate-pulse rounded bg-slate-100 motion-reduce:animate-none";

// Each step of the journey from visit to sale gets its own colour, cooling to green at the sale.
const FUNNEL_COLOURS = ["bg-sky-500", "bg-sky-600", "bg-teal-500", "bg-teal-600", "bg-emerald-500", "bg-emerald-600"];
const SOURCE_DOTS = ["bg-rose-500", "bg-sky-500", "bg-amber-500", "bg-teal-500", "bg-emerald-500", "bg-violet-500", "bg-slate-400"];
const DEVICES: Record<string, { label: string; icon: typeof Users; bar: string; tone: Meaning }> = {
  mobile: { label: "Phones", icon: Smartphone, bar: "bg-sky-500", tone: "orders" },
  tablet: { label: "Tablets", icon: Tablet, bar: "bg-teal-500", tone: "stock" },
  desktop: { label: "Computers", icon: Monitor, bar: "bg-rose-500", tone: "marketing" },
};

/** What the page looks like while the first set of figures loads. */
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className={`rounded-2xl p-4 sm:p-5 ${["bg-rose-50", "bg-emerald-50", "bg-sky-50", "bg-amber-50"][i]}`}>
            <div className={`h-4 w-24 ${pulse}`} />
            <div className={`mt-2 h-3 w-32 max-w-full ${pulse}`} />
            <div className={`mt-3 h-7 w-20 ${pulse}`} />
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className={`h-5 w-32 ${pulse}`} />
        <div className={`mt-4 h-56 w-full rounded-xl ${pulse}`} />
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className={`h-5 w-40 ${pulse}`} />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`h-3 w-full ${pulse}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Dashboard → Analytics. */
export default function AnalyticsDashboard({ slug }: { slug: string }) {
  const [range, setRange] = useState<AnalyticsData["range"]>("7d");
  // Worked out once, so rendering stays pure.
  const [dates] = useState(() => {
    const now = new Date();
    return { today: isoDate(now), lastMonth: lastMonth(now), visitsCutoff: isoDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 27)) };
  });
  // The custom dates being typed, and the ones last applied.
  const [draft, setDraft] = useState(lastMonth);
  const [custom, setCustom] = useState(lastMonth);
  const [dateError, setDateError] = useState("");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const query = range === "custom" ? `from=${custom.from}&to=${custom.to}` : `range=${range}`;

  function showCustom(next: { from: string; to: string }) {
    if (!next.from || !next.to) return setDateError("Choose a start date and an end date.");
    if (next.from > next.to) return setDateError("The start date needs to be on or before the end date.");
    if (next.from > dates.today) return setDateError("The start date can't be in the future.");
    setDateError("");
    setDraft(next);
    setCustom(next);
    setLoading(true);
    setRange("custom");
  }

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/analytics?slug=${encodeURIComponent(slug)}&${query}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (cancelled) return;
        if (ok) {
          setData(body);
          setError("");
        } else setError(typeof body.error === "string" ? body.error : "We couldn't load your analytics.");
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setError("We couldn't load your analytics. Please refresh the page.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [slug, query]);

  const shownDays = data?.range === "custom" ? data.days : null;
  const previousLabel =
    range === "today" ? "yesterday so far" : range === "7d" ? "the 7 days before" : range === "28d" ? "the 28 days before" : shownDays === 1 ? "the day before" : `the ${shownDays ?? "same number of"} days before`;
  const customLabel = custom.from === custom.to ? longDate(custom.from) : `${longDate(custom.from)} to ${longDate(custom.to)}`;
  const rangeLabel = range === "custom" ? customLabel : (RANGES.find((r) => r.key === range)?.label.toLowerCase() ?? "");
  const money = (v: number) => formatShopCurrency(v, data?.currency ?? "NGN");
  const onLastMonth = range === "custom" && custom.from === dates.lastMonth.from && custom.to === dates.lastMonth.to;
  // Visit-level events are kept for 28 days; sales come from orders, which are kept.
  const visitsCutoff = dates.visitsCutoff;
  const olderThanVisits = range === "custom" && custom.from < visitsCutoff;

  const header = (
    <div className="space-y-3">
      <DashSectionIntro
        id="analytics"
        meaning="marketing"
        art="chart"
        title="See how your shop is doing"
        points={[
          "Who visits, what they look at and how many go on to buy.",
          "Which places send you shoppers, so you know where sharing your link pays off.",
          "Where shoppers stop before buying, so you know what to make easier.",
        ]}
      />
      <div className="flex flex-wrap items-end gap-3">
        <div role="group" aria-label="Show figures for" className="inline-flex max-w-full flex-wrap rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => {
                setLoading(true);
                setRange(r.key);
              }}
              className={`rounded-lg px-3 py-2 text-sm ${focusRing} ${range === r.key ? "bg-xyvoo-blue font-semibold text-white" : "text-slate-700 hover:bg-slate-50"}`}
            >
              {r.label}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={onLastMonth}
            onClick={() => showCustom(dates.lastMonth)}
            className={`rounded-lg px-3 py-2 text-sm ${focusRing} ${onLastMonth ? "bg-xyvoo-blue font-semibold text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >
            Last month
          </button>
        </div>
        <form
          aria-label="Choose your own dates"
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            showCustom(draft);
          }}
        >
          <div>
            <label htmlFor="an-from" className="mb-1 block text-xs font-medium text-slate-700">
              From
            </label>
            <input
              id="an-from"
              type="date"
              value={draft.from}
              max={dates.today}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? "an-date-error" : undefined}
              className={`${dashInput} w-auto py-2`}
            />
          </div>
          <div>
            <label htmlFor="an-to" className="mb-1 block text-xs font-medium text-slate-700">
              To
            </label>
            <input
              id="an-to"
              type="date"
              value={draft.to}
              max={dates.today}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              aria-invalid={dateError ? true : undefined}
              aria-describedby={dateError ? "an-date-error" : undefined}
              className={`${dashInput} w-auto py-2`}
            />
          </div>
          <button type="submit" className={`${dashButton.secondary} ${focusRing} py-2`}>
            Show these dates
          </button>
        </form>
      </div>
      {dateError ? (
        <p id="an-date-error" role="alert" className="text-sm text-red-700">
          {dateError}
        </p>
      ) : null}
      {range === "custom" ? <p className="text-sm font-medium text-slate-800">Showing {customLabel}</p> : null}
      <p className="flex items-start gap-1.5 text-xs text-slate-500">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          Visitor figures only include shoppers who accept analytics cookies, so the real number may be a little higher. Sales include orders paid online and
          orders you confirmed, sent or delivered.
          {olderThanVisits ? " Visits are kept for 28 days, so visitor figures before then show as zero. Sales figures are complete." : ""}
        </span>
      </p>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        {error ? <DashAlert message={error} /> : <AnalyticsSkeleton />}
        {!error ? <p className="sr-only" role="status">Loading your figures</p> : null}
      </div>
    );
  }

  const { current: c, previous: p } = data;
  const conversion = pct(c.paidOrders, c.sessions);
  // Shoppers who turn down analytics cookies still buy, so orders can outnumber the visits we saw.
  const conversionKnown = c.sessions > 0 && c.paidOrders <= c.sessions;
  const averageOrder = c.paidOrders ? c.revenue / c.paidOrders : 0;
  const funnel = [
    { label: "Visited the shop", value: c.sessions },
    { label: "Added to basket", value: c.cartSessions },
    { label: "Started checkout", value: c.checkoutSessions },
    { label: "Entered their details", value: c.detailsSessions },
    { label: "Went to payment", value: c.paymentSessions },
    { label: "Bought", value: c.paidOrders },
  ];
  const biggestDrop = funnel.slice(1).reduce(
    (worst, step, i) => {
      const before = funnel[i].value;
      const lost = before ? 1 - step.value / before : 0;
      return lost > worst.lost ? { lost, at: `${funnel[i].label.toLowerCase()} and ${step.label.toLowerCase()}`, index: i + 1 } : worst;
    },
    { lost: 0, at: "", index: -1 },
  );
  const appSessions = data.devices.filter((d) => d.isApp).reduce((s, d) => s + d.sessions, 0);
  const deviceTotals = ["mobile", "tablet", "desktop"].map((d) => ({ device: d, sessions: data.devices.filter((x) => x.device === d).reduce((s, x) => s + x.sessions, 0) }));
  const totalSessions = deviceTotals.reduce((s, d) => s + d.sessions, 0);

  const extras: Array<{ label: string; hint: string; value: string; icon: typeof Users; meaning: Meaning }> = [
    { label: "Average order", hint: "What a customer usually spends", value: money(averageOrder), icon: Banknote, meaning: "money" },
    { label: "Pages viewed", hint: "Every page opened in your shop", value: number(c.pageViews), icon: FileText, meaning: "marketing" },
    { label: "Product views", hint: "Times a product page was opened", value: number(c.productViews), icon: Package, meaning: "stock" },
    { label: "Searches", hint: "Times shoppers used your search box", value: number(c.searches), icon: Search, meaning: "orders" },
  ];
  const changeWords = `on ${previousLabel}`;
  const sourceMax = Math.max(1, ...data.sources.map((s) => s.sessions));
  const productMax = Math.max(1, ...data.products.map((pr) => pr.revenue));

  return (
    <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {header}
      {error ? <DashAlert message={error} /> : null}

      <section aria-labelledby="an-headline">
        <h2 id="an-headline" className="sr-only">
          Headline figures for {rangeLabel}
        </h2>
        <DashStatStrip label={`Headline figures for ${rangeLabel}`}>
          <DashStatTile
            label="Visitors"
            meaning="marketing"
            icon={Users}
            hint={p.visitors ? "People who opened your shop" : `Nothing to compare with ${previousLabel}`}
            value={number(c.visitors)}
            change={change(c.visitors, p.visitors)}
            changeWords={changeWords}
          />
          <DashStatTile
            label="Sales"
            meaning="money"
            icon={Wallet}
            hint={p.revenue ? "Money from paid orders" : `Nothing to compare with ${previousLabel}`}
            value={money(c.revenue)}
            change={change(c.revenue, p.revenue)}
            changeWords={changeWords}
          />
          <DashStatTile
            label="Orders"
            meaning="orders"
            icon={ShoppingBag}
            hint={p.paidOrders ? "Orders that were paid for" : `Nothing to compare with ${previousLabel}`}
            value={number(c.paidOrders)}
            change={change(c.paidOrders, p.paidOrders)}
            changeWords={changeWords}
          />
          <DashStatTile
            label="Visits that bought"
            meaning="customers"
            icon={Eye}
            hint={
              conversionKnown
                ? "Out of every 100 visits, how many ended in a sale"
                : c.sessions
                  ? "Some buyers turned down analytics cookies, so we can't work this out"
                  : "No visits recorded in this period"
            }
            value={conversionKnown ? `${conversion}%` : "–"}
            change={conversionKnown && p.sessions && p.paidOrders <= p.sessions ? change(conversion, pct(p.paidOrders, p.sessions)) : null}
            changeWords={changeWords}
          />
        </DashStatStrip>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {extras.map((x) => (
            <div key={x.label} className="flex min-w-0 items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${MEANING[x.meaning].tint} ${MEANING[x.meaning].icon}`}>
                <x.icon className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <dt className="text-sm font-medium text-slate-700">{x.label}</dt>
                <dd className="mt-0.5 break-words font-heading text-lg font-bold text-slate-900">{x.value}</dd>
                <dd className="text-xs text-slate-500">{x.hint}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <Downloads slug={slug} query={query} canExport={data.canExport} periodLabel={rangeLabel} />

      {data.daily.length > 1 ? (
        <DashCard id="an-daily" icon={BarChart3} meaning="marketing" title="Day by day" description="Visitors and paid orders for each day, so you can spot your busiest days and the effect of a post or offer.">
          <div className="h-56 sm:h-64" aria-hidden>
            <Bar
              data={{
                labels: data.daily.map((d) => new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })),
                datasets: [
                  { label: "Visitors", data: data.daily.map((d) => d.visitors), backgroundColor: "#fb7185", borderRadius: 6, yAxisID: "y" },
                  { label: "Paid orders", data: data.daily.map((d) => d.paidOrders), backgroundColor: "#0284c7", borderRadius: 6, yAxisID: "y" },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                responsive: true,
                interaction: { mode: "index", intersect: false },
                scales: {
                  x: { grid: { display: false }, ticks: { maxTicksLimit: 7, maxRotation: 0, autoSkip: true, color: "#64748b" } },
                  y: { beginAtZero: true, border: { display: false }, ticks: { precision: 0, maxTicksLimit: 5, color: "#64748b" } },
                },
                plugins: { legend: { position: "bottom", labels: { boxWidth: 12, boxHeight: 12, color: "#334155" } } },
              }}
            />
          </div>
          <table className="sr-only">
            <caption>Visitors, paid orders and sales by day</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Visitors</th>
                <th scope="col">Paid orders</th>
                <th scope="col">Sales</th>
              </tr>
            </thead>
            <tbody>
              {data.daily.map((d) => (
                <tr key={d.day}>
                  <th scope="row">{d.day}</th>
                  <td>{d.visitors}</td>
                  <td>{d.paidOrders}</td>
                  <td>{money(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </DashCard>
      ) : null}

      <DashCard id="an-funnel" icon={Filter} meaning="orders" title="From visit to sale" description="How far shoppers get before they stop. The biggest drop shows where buying could be made easier.">
        {funnel[0].value === 0 ? (
          <DashEmptyState art="chart" meaning="orders" title="No visits yet in this period" description="Once people open your shop, you’ll see how many add to their basket, check out and pay. Share your shop link to get started." />
        ) : (
          <>
            <p className={`text-sm ${biggestDrop.lost > 0 ? "rounded-xl bg-amber-50 px-3 py-2.5 text-amber-950" : "text-slate-700"}`}>
              {biggestDrop.lost > 0
                ? `Most shoppers are lost between ${biggestDrop.at}: ${Math.round(biggestDrop.lost * 100)}% don’t carry on.`
                : "Each step shows how many visits got that far."}
            </p>
            <ol className="mt-4 space-y-3">
              {funnel.map((step, i) => (
                <li key={step.label}>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="flex flex-wrap items-center gap-2 text-slate-800">
                      {step.label}
                      {i === biggestDrop.index ? <DashPill tone="amber">Biggest drop</DashPill> : null}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">
                      {number(step.value)} <span className="font-normal text-slate-500">({pct(step.value, funnel[0].value)}%)</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 rounded-full bg-slate-100" aria-hidden>
                    <div className={`h-3 rounded-full ${FUNNEL_COLOURS[i]}`} style={{ width: `${Math.max(step.value ? 2 : 0, Math.min(100, pct(step.value, funnel[0].value)))}%` }} />
                  </div>
                </li>
              ))}
            </ol>
          </>
        )}
      </DashCard>

      <div className="grid gap-6 xl:grid-cols-2">
        <DashCard id="an-products" icon={Package} meaning="stock" title="Products" description="Which products people look at, add to their basket and buy." className="min-w-0">
          {data.products.length ? (
            <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
              <table className="w-full min-w-[30rem] text-left text-sm">
                <caption className="sr-only">Products: views, basket adds, units sold and sales for {rangeLabel}</caption>
                <thead className="bg-teal-50/70 text-xs text-slate-700">
                  <tr>
                    <th scope="col" className="rounded-l-lg py-2 pl-3 pr-3 font-semibold">Product</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Views</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Added to basket</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Sold</th>
                    <th scope="col" className="rounded-r-lg py-2 pr-3 text-right font-semibold">Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.products.map((pr) => (
                    <tr key={pr.productId}>
                      <th scope="row" className="py-2.5 pl-3 pr-3 font-medium text-slate-900">
                        <span className="block">{pr.name}</span>
                        <span aria-hidden className="mt-1.5 block h-1.5 w-full max-w-[10rem] rounded-full bg-teal-50">
                          <span className="block h-1.5 rounded-full bg-teal-500" style={{ width: `${Math.max(pr.revenue ? 4 : 0, (pr.revenue / productMax) * 100)}%` }} />
                        </span>
                        {pr.cartAdds >= 3 && pr.unitsSold === 0 ? (
                          <span className="mt-1 block">
                            <DashPill tone="amber">Added often, not bought</DashPill>
                          </span>
                        ) : null}
                      </th>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{number(pr.views)}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{number(pr.cartAdds)}</td>
                      <td className="py-2.5 pr-3 text-right text-slate-700">{number(pr.unitsSold)}</td>
                      <td className="py-2.5 pr-3 text-right font-semibold text-emerald-800">{money(pr.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <DashEmptyState art="box" meaning="stock" title="No product activity yet" description="When shoppers view, add or buy your products, each one will be listed here with its figures." />
          )}
        </DashCard>

        <DashCard id="an-sources" icon={Megaphone} meaning="marketing" title="Where visitors come from" description="The places that send people to your shop, so you know where sharing your link pays off." className="min-w-0">
          {data.sources.length ? (
            <>
              <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
                <table className="w-full min-w-[24rem] text-left text-sm">
                  <caption className="sr-only">Where visitors come from: visits, checkouts and sales for {rangeLabel}</caption>
                  <thead className="border-b border-slate-200 text-xs text-slate-600">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-semibold">Source</th>
                      <th scope="col" className="py-2 pr-3 text-right font-semibold">Visits</th>
                      <th scope="col" className="py-2 pr-3 text-right font-semibold">Checkouts</th>
                      <th scope="col" className="py-2 text-right font-semibold">Sales</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.sources.map((s, i) => (
                      <tr key={s.source}>
                        <th scope="row" className="py-2.5 pr-3 font-medium text-slate-900">
                          <span className="flex items-center gap-2">
                            <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${SOURCE_DOTS[i % SOURCE_DOTS.length]}`} />
                            {SOURCE_LABELS[s.source] ?? s.source}
                          </span>
                          <span aria-hidden className="ml-[1.125rem] mt-1.5 block h-1.5 max-w-[10rem] rounded-full bg-slate-100">
                            <span className={`block h-1.5 rounded-full ${SOURCE_DOTS[i % SOURCE_DOTS.length]}`} style={{ width: `${(s.sessions / sourceMax) * 100}%` }} />
                          </span>
                        </th>
                        <td className="py-2.5 pr-3 text-right text-slate-700">{number(s.sessions)}</td>
                        <td className="py-2.5 pr-3 text-right text-slate-700">{number(s.checkoutSessions)}</td>
                        <td className="py-2.5 text-right font-semibold text-emerald-800">{money(s.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-slate-700">
                Tip: add <code className="break-all rounded bg-white px-1 text-slate-800">?utm_source=instagram</code> (or whatsapp, flyer…) to links you share to see
                exactly which ones bring sales.
              </p>
            </>
          ) : (
            <DashEmptyState art="megaphone" meaning="marketing" title="No visits recorded yet" description="Share your shop link on WhatsApp, Instagram or anywhere your customers are, and the places they come from will show here." />
          )}
        </DashCard>

        <DashCard id="an-devices" icon={Smartphone} meaning="orders" title="Devices and your app" description="What shoppers use to visit, so you know where your shop needs to look its best." className="min-w-0">
          <ul className="space-y-3 text-sm">
            {deviceTotals.map((d) => {
              const look = DEVICES[d.device];
              return (
              <li key={d.device}>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-800">
                    <span aria-hidden className={`flex h-7 w-7 items-center justify-center rounded-lg ${MEANING[look.tone].tint} ${MEANING[look.tone].icon}`}>
                      <look.icon className="h-4 w-4" />
                    </span>
                    {look.label}
                  </span>
                  <span className="shrink-0 font-medium text-slate-900">
                    {number(d.sessions)} <span className="font-normal text-slate-500">({pct(d.sessions, totalSessions)}%)</span>
                  </span>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-slate-100" aria-hidden>
                  <div className={`h-2.5 rounded-full ${look.bar}`} style={{ width: `${pct(d.sessions, totalSessions)}%` }} />
                </div>
              </li>
              );
            })}
          </ul>
          <dl className="mt-4 space-y-2 border-t border-slate-100 pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-800">Visits from your installed app</dt>
              <dd className="font-medium text-slate-900">{number(appSessions)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-800">App installs</dt>
              <dd className="font-medium text-slate-900">{number(c.appInstalls)}</dd>
            </div>
          </dl>
        </DashCard>

        <DashCard id="an-notifications" icon={Bell} meaning="marketing" title="Notifications" description="How many customers received and opened the notifications you sent." className="min-w-0">
          {data.notifications.length ? (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.notifications.map((n) => (
                <li key={n.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 break-words font-medium text-slate-900">{n.title}</span>
                  <span className="text-slate-600">
                    Delivered {number(n.delivered)} · Opened {number(n.opened)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <DashEmptyState art="bell" meaning="marketing" title="No notifications sent in this period" description="When you send a notification from the Notifications page, you’ll see how many people received and opened it." />
          )}
        </DashCard>
      </div>
    </div>
  );
}
