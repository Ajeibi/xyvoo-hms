"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Line } from "react-chartjs-2";
import { ArrowRight, Banknote, Landmark, Package, PackageOpen, Palette, Plus, ShoppingCart, Tag, Truck, Users } from "lucide-react";
import type { DashboardProduct } from "@/lib/store/products";
import type { DashboardOrder } from "@/lib/store/orders";
import { formatShopCurrency } from "@/lib/shop/format";
import { isSale, saleAmount } from "@/lib/store/sales";
import { isAwaitingPaymentCheck, isReadyToSend } from "@/lib/store/order-attention";
import { DashStatStrip, DashStatTile, percentChange } from "./dashboard-ui";
import { Illustration } from "./illustrations";
import { MEANING, type Meaning } from "./meaning";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_PILL: Record<DashboardOrder["status"], string> = {
  Pending: "bg-amber-50 text-amber-800",
  Confirmed: "bg-sky-50 text-sky-800",
  Shipped: "bg-teal-50 text-teal-800",
  Delivered: "bg-emerald-50 text-emerald-800",
  Cancelled: "bg-slate-100 text-slate-600",
};

// Customers get a soft colour each, picked from their name, so the list isn't a column of grey circles.
const AVATAR_TONES = ["bg-sky-100 text-sky-800", "bg-amber-100 text-amber-900", "bg-teal-100 text-teal-800", "bg-rose-100 text-rose-800", "bg-emerald-100 text-emerald-800"];

function greetingFor(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function timeAgo(iso: string, now: number) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) {
      if (unit === "day" && Math.abs(seconds) > 6 * 86400) return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return rtf.format(Math.round(seconds / size), unit);
    }
  }
  return "just now";
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
}

function avatarTone(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Sales in a window of days ending `endDaysAgo` days ago. */
function salesBetween(orders: DashboardOrder[], now: number, startDaysAgo: number, endDaysAgo: number) {
  return orders.filter((o) => {
    const age = now - new Date(o.createdAt).getTime();
    return isSale(o.paymentStatus, o.status) && age < startDaysAgo * DAY_MS && age >= endDaysAgo * DAY_MS;
  });
}

/** Different people who bought: by email, else phone, else name. */
function buyers(orders: DashboardOrder[]) {
  return new Set(orders.map((o) => (o.customerEmail || o.customerPhone || o.customerName).trim().toLowerCase())).size;
}

/** Items sold, less any put back in stock after a refund. */
function itemsSold(orders: DashboardOrder[]) {
  return orders.reduce((total, o) => total + o.items.reduce((n, i) => n + Math.max(0, i.quantity - (i.restocked_quantity || 0)), 0), 0);
}

function buildSalesSeries(orders: DashboardOrder[], now: Date) {
  const buckets = new Map<string, number>();
  const labels: string[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    buckets.set(date.toISOString().slice(0, 10), 0);
    labels.push(date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }));
  }
  // Sales only: unpaid, failed and cancelled orders aren't money in.
  for (const order of orders.filter((o) => isSale(o.paymentStatus, o.status))) {
    const key = order.createdAt.slice(0, 10);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) || 0) + saleAmount(order));
  }
  return { labels, data: Array.from(buckets.values()) };
}

export default function StorefrontOverview({
  slug,
  currency,
  firstName,
  live,
  checklist,
}: {
  slug: string;
  currency: string;
  firstName: string;
  live: boolean;
  /** The setup or shop-status card, shown under the greeting. */
  checklist?: React.ReactNode;
}) {
  // Loaded together with the moment they were loaded, so "this week" and the greeting use the merchant's own clock.
  const [data, setData] = useState<{ products: DashboardProduct[]; orders: DashboardOrder[]; now: Date } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const products = data?.products ?? null;
  const orders = data?.orders ?? null;
  const now = data?.now ?? null;
  const base = `/storefront/${slug}`;
  const money = (value: number) => formatShopCurrency(value, currency);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}`), fetch(`/api/store/orders/summary?slug=${encodeURIComponent(slug)}`)])
      .then(async ([productsRes, ordersRes]) => {
        if (!productsRes.ok || !ordersRes.ok) throw new Error("We couldn't load your shop's figures just now. Please refresh the page.");
        const [productsJson, ordersJson] = await Promise.all([productsRes.json(), ordersRes.json()]);
        if (!cancelled) setData({ products: productsJson.products || [], orders: ordersJson.orders || [], now: new Date() });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const summary = useMemo(() => {
    if (!products || !orders || !now) return null;
    const at = now.getTime();
    const thisMonth = salesBetween(orders, at, 30, 0);
    const lastMonth = salesBetween(orders, at, 60, 30);
    // Refunded money isn't money in, nor profit.
    const sum = (list: DashboardOrder[], key: "totalAmount" | "profit") =>
      list.reduce((total, o) => total + (key === "totalAmount" ? saleAmount(o) : o.profit - o.refundedAmount), 0);
    const lastWeek = orders.filter((o) => at - new Date(o.createdAt).getTime() < 7 * DAY_MS && o.status !== "Cancelled");

    // What's selling: items from this month's sales, most sold first.
    const byProduct = new Map<string, { name: string; quantity: number; productId: string | null }>();
    for (const order of thisMonth) {
      for (const item of order.items) {
        const key = item.product_id || item.product_name;
        const row = byProduct.get(key) || { name: item.product_name, quantity: 0, productId: item.product_id };
        row.quantity += Math.max(0, item.quantity - (item.restocked_quantity || 0));
        byProduct.set(key, row);
      }
    }
    const images = new Map(products.map((p) => [p.id, p.imageUrl]));
    const topSellers = [...byProduct.values()]
      .filter((p) => p.quantity > 0)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5)
      .map((p) => ({ ...p, imageUrl: p.productId ? images.get(p.productId) ?? null : null }));

    return {
      sales: sum(thisMonth, "totalAmount"),
      salesBefore: sum(lastMonth, "totalAmount"),
      profit: sum(thisMonth, "profit"),
      profitBefore: sum(lastMonth, "profit"),
      orderCount: thisMonth.length,
      orderCountBefore: lastMonth.length,
      buyers: buyers(thisMonth),
      buyersBefore: buyers(lastMonth),
      itemsSold: itemsSold(thisMonth),
      itemsSoldBefore: itemsSold(lastMonth),
      average: thisMonth.length ? sum(thisMonth, "totalAmount") / thisMonth.length : 0,
      ordersThisWeek: lastWeek.length,
      toSend: orders.filter(isReadyToSend),
      toConfirm: orders.filter(isAwaitingPaymentCheck),
      outOfStock: products.filter((p) => p.stockStatus === "out-of-stock"),
      lowStock: products.filter((p) => p.stockStatus === "low-stock"),
      topSellers,
    };
  }, [products, orders, now]);

  const series = useMemo(() => (now ? buildSalesSeries(orders || [], now) : { labels: [], data: [] as number[] }), [orders, now]);
  const hasSales = series.data.some((v) => v > 0);
  const recentOrders = (orders || []).slice(0, 5);

  const names = (list: DashboardProduct[]) => list.slice(0, 3).map((p) => p.name).join(", ") + (list.length > 3 ? ` and ${list.length - 3} more` : "");
  const attention: Array<{ icon: React.ComponentType<{ className?: string }>; meaning: Meaning; title: string; detail: string; href: string; action: string }> = summary
    ? [
        summary.toSend.length > 0 && {
          icon: Truck,
          meaning: "orders" as const,
          title: `${plural(summary.toSend.length, "order is", "orders are")} ready to send`,
          detail: "Paid for (or paying on delivery) and waiting to go out.",
          href: `${base}/orders?show=to-send`,
          action: "Send them",
        },
        summary.toConfirm.length > 0 && {
          icon: Landmark,
          meaning: "money" as const,
          title: `${plural(summary.toConfirm.length, "payment", "payments")} to check`,
          detail: "Customers chose bank transfer. Check the money has arrived, then confirm.",
          href: `${base}/orders?show=to-confirm`,
          action: "Check payments",
        },
        summary.outOfStock.length > 0 && {
          icon: PackageOpen,
          meaning: "stock" as const,
          title: `${plural(summary.outOfStock.length, "product has", "products have")} sold out`,
          detail: names(summary.outOfStock),
          href: `${base}/products`,
          action: "Restock",
        },
        summary.lowStock.length > 0 && {
          icon: Package,
          meaning: "stock" as const,
          title: `${plural(summary.lowStock.length, "product is", "products are")} running low`,
          detail: names(summary.lowStock),
          href: `${base}/products`,
          action: "Review stock",
        },
      ].filter((item): item is Exclude<typeof item, false> => Boolean(item))
    : [];

  const headline = (() => {
    if (!summary) return "Here's how your shop is doing.";
    if (!live && (orders?.length ?? 0) === 0) return "A few steps and your shop is ready for customers.";
    const needs = summary.toSend.length + summary.toConfirm.length;
    const week = summary.ordersThisWeek ? `You've had ${plural(summary.ordersThisWeek, "order", "orders")} this week` : "No new orders this week yet";
    return needs ? `${week}, and ${plural(needs, "order needs", "orders need")} you.` : `${week}. You're all caught up.`;
  })();

  const quickActions: Array<{ href: string; label: string; icon: React.ComponentType<{ className?: string }>; meaning: Meaning }> = [
    { href: `${base}/products`, label: "Add a product", icon: Plus, meaning: "stock" },
    { href: `${base}/discounts`, label: "Create a discount", icon: Tag, meaning: "marketing" },
    { href: `${base}/customers`, label: "See your customers", icon: Users, meaning: "customers" },
    { href: `${base}/website`, label: "Edit your website", icon: Palette, meaning: "marketing" },
  ];

  const topMax = summary?.topSellers[0]?.quantity || 1;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-slate-500" suppressHydrationWarning>
          {now ? now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : " "}
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl" suppressHydrationWarning>
          {now ? greetingFor(now) : "Hello"}
          {firstName ? `, ${firstName}` : ""}
        </h1>
        <p className="mt-1.5 text-base text-slate-600">{headline}</p>
      </header>

      {checklist}

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p> : null}

      <section aria-labelledby="figures-title" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="figures-title" className="font-heading text-lg font-semibold text-slate-900">
            The last 30 days
          </h2>
          <Link href={`${base}/analytics`} className="text-sm font-medium text-blue-700 hover:underline">
            More in Analytics
          </Link>
        </div>
        <DashStatStrip label="The last 30 days in figures">
          <DashStatTile
            label="Money in"
            meaning="money"
            icon={Banknote}
            hint="Paid orders, before fees"
            value={summary ? money(summary.sales) : null}
            change={summary ? percentChange(summary.sales, summary.salesBefore) : null}
            href={`${base}/analytics`}
          />
          <DashStatTile
            label="Orders"
            meaning="orders"
            icon={ShoppingCart}
            hint="Paid orders"
            value={summary ? String(summary.orderCount) : null}
            change={summary ? percentChange(summary.orderCount, summary.orderCountBefore) : null}
            href={`${base}/orders`}
          />
          <DashStatTile
            label="Customers"
            meaning="customers"
            icon={Users}
            hint="Different people who bought"
            value={summary ? String(summary.buyers) : null}
            change={summary ? percentChange(summary.buyers, summary.buyersBefore) : null}
            href={`${base}/customers`}
          />
          <DashStatTile
            label="Items sold"
            meaning="stock"
            icon={Package}
            hint="Across all your products"
            value={summary ? String(summary.itemsSold) : null}
            change={summary ? percentChange(summary.itemsSold, summary.itemsSoldBefore) : null}
            href={`${base}/products`}
          />
        </DashStatStrip>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-labelledby="attention-title" className="rounded-2xl bg-emerald-50/70 p-5 lg:col-span-3">
          <h2 id="attention-title" className="font-heading text-lg font-semibold text-slate-900">
            Needs your attention
          </h2>
          {!summary ? (
            <SkeletonRows rows={2} />
          ) : attention.length === 0 ? (
            <div className="mt-3 flex flex-col items-center gap-2 rounded-xl bg-white px-4 py-6 text-center sm:flex-row sm:text-left">
              <span className="text-emerald-500">
                <Illustration name="box" />
              </span>
              <div className="text-sm">
                <p className="font-heading text-base font-semibold text-slate-900">You&rsquo;re all caught up</p>
                <p className="mt-0.5 text-slate-600">Orders to send, payments to check and low stock will show up here.</p>
              </div>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {attention.map((item) => {
                const tone = MEANING[item.meaning];
                return (
                  <li key={item.title}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-4 rounded-xl bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue"
                    >
                      <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.tint} ${tone.icon}`}>
                        <item.icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="block font-semibold text-slate-900">{item.title}</span>
                        <span className="block truncate text-slate-600">{item.detail}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-blue-700 group-hover:underline sm:inline-flex">
                        {item.action} <ArrowRight className="h-4 w-4" aria-hidden />
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="shortcuts-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 id="shortcuts-title" className="font-heading text-lg font-semibold text-slate-900">
            Quick actions
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-3">
            {quickActions.map((s) => {
              const tone = MEANING[s.meaning];
              return (
                <li key={s.label}>
                  <Link
                    href={s.href}
                    className={`flex h-full flex-col gap-3 rounded-xl p-3.5 text-sm font-semibold text-slate-800 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue ${tone.tint}`}
                  >
                    <span aria-hidden className={`flex h-9 w-9 items-center justify-center rounded-xl shadow-sm ${tone.iconBox}`}>
                      <s.icon className="h-[18px] w-[18px]" />
                    </span>
                    {s.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <section aria-labelledby="chart-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 id="chart-title" className="font-heading text-lg font-semibold text-slate-900">
              Sales day by day
            </h2>
            {summary && hasSales ? (
              <dl className="flex gap-2 text-xs">
                <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5">
                  <dt className="text-slate-600">Average order</dt>
                  <dd className="font-semibold text-slate-900">{money(summary.average)}</dd>
                </div>
                <div className="rounded-lg bg-emerald-50 px-2.5 py-1.5">
                  <dt className="text-slate-600">Profit</dt>
                  <dd className="font-semibold text-slate-900">{money(summary.profit)}</dd>
                </div>
              </dl>
            ) : null}
          </div>
          {!summary ? (
            <div className="mt-4 h-48 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
          ) : hasSales ? (
            <div className="mt-4 h-56">
              <Line
                aria-label={`Sales for each of the last 30 days. Total ${money(summary.sales)}.`}
                role="img"
                data={{
                  labels: series.labels,
                  datasets: [
                    {
                      label: "Sales",
                      data: series.data,
                      borderColor: "#007edf",
                      backgroundColor: "rgba(0, 126, 223, 0.12)",
                      fill: true,
                      tension: 0.35,
                      pointRadius: 0,
                      pointHoverRadius: 4,
                      borderWidth: 2.5,
                    },
                  ],
                }}
                options={{
                  maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => money(Number(ctx.parsed.y) || 0) } } },
                  scales: {
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 6, color: "#64748b" } },
                    y: { beginAtZero: true, border: { display: false }, ticks: { maxTicksLimit: 4, color: "#64748b", callback: (v) => money(Number(v)) } },
                  },
                }}
              />
            </div>
          ) : (
            <div className="mt-4 flex flex-col items-center justify-center rounded-xl bg-slate-50 px-4 py-6 text-center">
              <span className="text-sky-500">
                <Illustration name="chart" />
              </span>
              <p className="mt-1 text-sm font-semibold text-slate-800">No sales in the last 30 days yet</p>
              <p className="mt-1 max-w-xs text-sm text-slate-600">Each day&rsquo;s sales will appear here as orders come in.</p>
            </div>
          )}
        </section>

        <section aria-labelledby="recent-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="recent-title" className="font-heading text-lg font-semibold text-slate-900">
              Latest orders
            </h2>
            {recentOrders.length ? (
              <Link href={`${base}/orders`} className="text-sm font-medium text-blue-700 hover:underline">
                See all
              </Link>
            ) : null}
          </div>
          {!orders ? (
            <SkeletonRows rows={3} />
          ) : recentOrders.length === 0 ? (
            <div className="mt-4 flex flex-col items-center rounded-xl bg-slate-50 px-4 py-6 text-center">
              <span className="text-sky-500">
                <Illustration name="basket" />
              </span>
              <p className="mt-1 text-sm font-semibold text-slate-800">No orders yet</p>
              <p className="mt-1 text-sm text-slate-600">{live ? "Share your shop link to bring in your first customer." : "Your first order will show here once your shop is open."}</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {recentOrders.map((order) => (
                <li key={order.id} className="flex items-center gap-3 py-3">
                  <span aria-hidden className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTone(order.customerName)}`}>
                    {initials(order.customerName)}
                  </span>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="truncate font-medium text-slate-900">
                      <Link href={`${base}/orders/${order.id}`} className="hover:text-blue-800 hover:underline">
                        {order.customerName}
                      </Link>
                    </p>
                    <p className="text-slate-500">
                      {plural(order.itemCount, "item", "items")} · {now ? timeAgo(order.createdAt, now.getTime()) : null}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <p className="font-semibold text-slate-900">{formatShopCurrency(order.totalAmount, order.currency)}</p>
                    <span className={`mt-0.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_PILL[order.status]}`}>{order.status}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {summary && summary.topSellers.length ? (
        <section aria-labelledby="top-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 id="top-title" className="font-heading text-lg font-semibold text-slate-900">
            What&rsquo;s selling
          </h2>
          <p className="text-sm text-slate-600">Your best sellers in the last 30 days.</p>
          <ol className="mt-4 space-y-3">
            {summary.topSellers.map((p, index) => (
              <li key={p.name} className="flex items-center gap-3">
                <span className="w-5 shrink-0 text-right text-sm font-semibold text-slate-500">{index + 1}</span>
                <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-teal-50 text-teal-700">
                  {p.imageUrl ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" /> : <Package className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="truncate font-medium text-slate-900">{p.name}</span>
                    <span className="shrink-0 text-slate-600">{plural(p.quantity, "sold", "sold")}</span>
                  </div>
                  <div aria-hidden className="mt-1.5 h-2 overflow-hidden rounded-full bg-teal-50">
                    <div className="h-full rounded-full bg-teal-500" style={{ width: `${Math.max(6, (p.quantity / topMax) * 100)}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function SkeletonRows({ rows }: { rows: number }) {
  return (
    <div className="mt-4 space-y-3" aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-10 w-10 animate-pulse rounded-xl bg-white/80 motion-reduce:animate-none" />
          <div className="h-4 flex-1 animate-pulse rounded bg-white/80 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}
