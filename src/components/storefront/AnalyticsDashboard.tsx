"use client";

import { useEffect, useState } from "react";
import { BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Bar } from "react-chartjs-2";
import { ArrowDownRight, ArrowUpRight, Bell, Eye, Info, ShoppingBag, Smartphone, Users, Wallet } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { DashAlert } from "./dashboard-ui";

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

type AnalyticsData = {
  range: "today" | "7d" | "28d";
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

const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const change = (now: number, before: number) => (before ? Math.round(((now - before) / before) * 1000) / 10 : null);
const number = (v: number) => v.toLocaleString("en-GB");

function Kpi({ icon: Icon, label, value, now, before, previousLabel }: { icon: typeof Users; label: string; value: string; now: number; before: number; previousLabel: string }) {
  const diff = change(now, before);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="h-4 w-4" aria-hidden /> {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
      <p className={`mt-1 flex items-center gap-1 text-xs ${diff === null ? "text-slate-500" : diff >= 0 ? "text-emerald-700" : "text-red-700"}`}>
        {diff === null ? null : diff >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
        {diff === null ? `Nothing to compare with ${previousLabel}` : `${diff >= 0 ? "Up" : "Down"} ${Math.abs(diff)}% on ${previousLabel}`}
      </p>
    </div>
  );
}

/** Dashboard → Analytics. */
export default function AnalyticsDashboard({ slug }: { slug: string }) {
  const [range, setRange] = useState<AnalyticsData["range"]>("7d");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/analytics?slug=${encodeURIComponent(slug)}&range=${range}`)
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
  }, [slug, range]);

  const previousLabel = range === "today" ? "yesterday so far" : range === "7d" ? "the 7 days before" : "the 28 days before";
  const money = (v: number) => formatShopCurrency(v, data?.currency ?? "NGN");

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="group" aria-label="Date range" className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => {
              setLoading(true);
              setRange(r.key);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm ${range === r.key ? "bg-xyvoo-blue font-semibold text-white" : "text-slate-700 hover:bg-slate-50"}`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <p className="flex items-center gap-1.5 text-xs text-slate-500">
        <Info className="h-3.5 w-3.5" aria-hidden /> Visits count shoppers who accept analytics cookies. Sales include orders paid online and orders you confirmed, shipped or delivered.
      </p>
    </div>
  );

  if (!data) {
    return (
      <div className="space-y-6">
        {header}
        {error ? <DashAlert message={error} /> : <p className="text-sm text-slate-500">Loading…</p>}
      </div>
    );
  }

  const { current: c, previous: p } = data;
  const conversion = pct(c.paidOrders, c.sessions);
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
      return lost > worst.lost ? { lost, at: `${funnel[i].label.toLowerCase()} and ${step.label.toLowerCase()}` } : worst;
    },
    { lost: 0, at: "" },
  );
  const appSessions = data.devices.filter((d) => d.isApp).reduce((s, d) => s + d.sessions, 0);
  const deviceTotals = ["mobile", "tablet", "desktop"].map((d) => ({ device: d, sessions: data.devices.filter((x) => x.device === d).reduce((s, x) => s + x.sessions, 0) }));
  const totalSessions = deviceTotals.reduce((s, d) => s + d.sessions, 0);

  return (
    <div className={`space-y-6 ${loading ? "opacity-60" : ""}`} aria-busy={loading}>
      {header}
      {error ? <DashAlert message={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icon={Users} label="Visitors" value={number(c.visitors)} now={c.visitors} before={p.visitors} previousLabel={previousLabel} />
        <Kpi icon={Wallet} label="Sales" value={money(c.revenue)} now={c.revenue} before={p.revenue} previousLabel={previousLabel} />
        <Kpi icon={ShoppingBag} label="Orders" value={number(c.paidOrders)} now={c.paidOrders} before={p.paidOrders} previousLabel={previousLabel} />
        <Kpi icon={Eye} label="Conversion rate" value={`${conversion}%`} now={conversion} before={pct(p.paidOrders, p.sessions)} previousLabel={previousLabel} />
      </div>
      <p className="text-sm text-slate-600">
        Average order {money(averageOrder)} · {number(c.pageViews)} pages viewed · {number(c.productViews)} product views · {number(c.searches)} searches
      </p>

      {data.daily.length > 1 ? (
        <section aria-labelledby="an-daily" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="an-daily" className="text-base font-semibold text-slate-900">
            Day by day
          </h2>
          <div className="mt-4 h-64" aria-hidden>
            <Bar
              data={{
                labels: data.daily.map((d) => new Date(`${d.day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })),
                datasets: [
                  { label: "Visitors", data: data.daily.map((d) => d.visitors), backgroundColor: "#93c5fd", yAxisID: "y" },
                  { label: "Paid orders", data: data.daily.map((d) => d.paidOrders), backgroundColor: "#1d4ed8", yAxisID: "y" },
                ],
              }}
              options={{ maintainAspectRatio: false, responsive: true, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }, plugins: { legend: { position: "bottom" } } }}
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
        </section>
      ) : null}

      <section aria-labelledby="an-funnel" className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 id="an-funnel" className="text-base font-semibold text-slate-900">
          From visit to sale
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {biggestDrop.lost > 0
            ? `Most visitors are lost between ${biggestDrop.at} (${Math.round(biggestDrop.lost * 100)}% don't continue).`
            : "Each step shows how many visits got that far."}
        </p>
        <ol className="mt-4 space-y-3">
          {funnel.map((step) => (
            <li key={step.label}>
              <div className="flex justify-between text-sm">
                <span className="text-slate-800">{step.label}</span>
                <span className="font-medium text-slate-900">
                  {number(step.value)} <span className="font-normal text-slate-500">({pct(step.value, funnel[0].value)}%)</span>
                </span>
              </div>
              <div className="mt-1 h-2.5 rounded-full bg-slate-100">
                <div className="h-2.5 rounded-full bg-xyvoo-blue" style={{ width: `${Math.max(step.value ? 2 : 0, pct(step.value, funnel[0].value))}%` }} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section aria-labelledby="an-products" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="an-products" className="text-base font-semibold text-slate-900">
            Products
          </h2>
          {data.products.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-semibold">Product</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Views</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Added</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Sold</th>
                    <th scope="col" className="py-2 text-right font-semibold">Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.products.map((pr) => (
                    <tr key={pr.productId}>
                      <th scope="row" className="py-2 pr-3 font-medium text-slate-900">
                        {pr.name}
                        {pr.cartAdds >= 3 && pr.unitsSold === 0 ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-normal text-amber-900">Added often, not bought</span> : null}
                      </th>
                      <td className="py-2 pr-3 text-right">{number(pr.views)}</td>
                      <td className="py-2 pr-3 text-right">{number(pr.cartAdds)}</td>
                      <td className="py-2 pr-3 text-right">{number(pr.unitsSold)}</td>
                      <td className="py-2 text-right">{money(pr.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No product views or sales in this period yet.</p>
          )}
        </section>

        <section aria-labelledby="an-sources" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="an-sources" className="text-base font-semibold text-slate-900">
            Where visitors come from
          </h2>
          {data.sources.length ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-semibold">Source</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Visits</th>
                    <th scope="col" className="py-2 pr-3 text-right font-semibold">Checkouts</th>
                    <th scope="col" className="py-2 text-right font-semibold">Sales</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.sources.map((s) => (
                    <tr key={s.source}>
                      <th scope="row" className="py-2 pr-3 font-medium text-slate-900">{SOURCE_LABELS[s.source] ?? s.source}</th>
                      <td className="py-2 pr-3 text-right">{number(s.sessions)}</td>
                      <td className="py-2 pr-3 text-right">{number(s.checkoutSessions)}</td>
                      <td className="py-2 text-right">{money(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 text-xs text-slate-500">
                Tip: add <code className="rounded bg-slate-100 px-1">?utm_source=instagram</code> (or whatsapp, flyer…) to links you share to see exactly which ones bring sales.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No visits recorded in this period yet.</p>
          )}
        </section>

        <section aria-labelledby="an-devices" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="an-devices" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Smartphone className="h-4 w-4" aria-hidden /> Devices and your app
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {deviceTotals.map((d) => (
              <li key={d.device} className="flex justify-between">
                <span className="capitalize text-slate-800">{d.device === "mobile" ? "Phones" : d.device === "tablet" ? "Tablets" : "Computers"}</span>
                <span className="font-medium text-slate-900">
                  {number(d.sessions)} <span className="font-normal text-slate-500">({pct(d.sessions, totalSessions)}%)</span>
                </span>
              </li>
            ))}
            <li className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-800">Visits from your installed app</span>
              <span className="font-medium text-slate-900">{number(appSessions)}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-slate-800">App installs</span>
              <span className="font-medium text-slate-900">{number(c.appInstalls)}</span>
            </li>
          </ul>
        </section>

        <section aria-labelledby="an-notifications" className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 id="an-notifications" className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Bell className="h-4 w-4" aria-hidden /> Notifications
          </h2>
          {data.notifications.length ? (
            <ul className="mt-3 divide-y divide-slate-100 text-sm">
              {data.notifications.map((n) => (
                <li key={n.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span className="font-medium text-slate-900">{n.title}</span>
                  <span className="text-slate-600">
                    Delivered {number(n.delivered)} · Opened {number(n.opened)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-500">No notifications sent in this period.</p>
          )}
        </section>
      </div>
    </div>
  );
}
