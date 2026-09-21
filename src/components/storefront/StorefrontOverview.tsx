"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { AlertTriangle, Package, ShoppingCart, Wallet } from "lucide-react";
import type { DashboardProduct } from "@/lib/store/products";
import type { DashboardOrder } from "@/lib/store/orders";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

function formatCurrency(value: number, currency: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function buildRevenueSeries(orders: DashboardOrder[]) {
  const days = 30;
  const buckets = new Map<string, number>();
  const labels: string[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, 0);
    labels.push(date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }));
  }

  for (const order of orders) {
    const key = order.createdAt.slice(0, 10);
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) || 0) + order.totalAmount);
    }
  }

  return { labels, data: Array.from(buckets.values()) };
}

export default function StorefrontOverview({ slug }: { slug: string }) {
  const [products, setProducts] = useState<DashboardProduct[] | null>(null);
  const [orders, setOrders] = useState<DashboardOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [productsRes, ordersRes] = await Promise.all([
          fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}`),
          fetch(`/api/store/orders/list?slug=${encodeURIComponent(slug)}`),
        ]);

        if (!productsRes.ok || !ordersRes.ok) {
          throw new Error("Failed to load storefront overview.");
        }

        const productsJson = await productsRes.json();
        const ordersJson = await ordersRes.json();

        if (!cancelled) {
          setProducts(productsJson.products || []);
          setOrders(ordersJson.orders || []);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const metrics = useMemo(() => {
    if (!products || !orders) return null;

    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const totalProfit = orders.reduce((sum, order) => sum + order.profit, 0);
    const lowStockCount = products.filter((p) => p.stockStatus !== "in-stock").length;
    const currency = products.find((p) => p.currency)?.currency || null;

    return {
      totalRevenue,
      totalProfit,
      orderCount: orders.length,
      productCount: products.length,
      lowStockCount,
      currency,
    };
  }, [products, orders]);

  const revenueSeries = useMemo(() => buildRevenueSeries(orders || []), [orders]);
  const recentOrders = (orders || []).slice(0, 8);

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!metrics) {
    return <p className="text-sm text-slate-500">Loading overview…</p>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={Wallet}
          label="Total revenue"
          value={formatCurrency(metrics.totalRevenue, metrics.currency)}
        />
        <MetricCard
          icon={Wallet}
          label="Total profit"
          value={formatCurrency(metrics.totalProfit, metrics.currency)}
        />
        <MetricCard icon={ShoppingCart} label="Orders" value={String(metrics.orderCount)} />
        <MetricCard icon={Package} label="Products" value={String(metrics.productCount)} />
      </div>

      {metrics.lowStockCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {metrics.lowStockCount} product{metrics.lowStockCount === 1 ? "" : "s"} low or out of stock.
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Revenue — last 30 days</h2>
        <Line
          data={{
            labels: revenueSeries.labels,
            datasets: [
              {
                label: "Revenue",
                data: revenueSeries.data,
                borderColor: "#2563eb",
                backgroundColor: "rgba(37, 99, 235, 0.1)",
                fill: true,
                tension: 0.3,
              },
            ],
          }}
          options={{
            responsive: true,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } },
          }}
          height={90}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-700">Recent orders</h2>
        {recentOrders.length === 0 ? (
          <p className="text-sm text-slate-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="pb-2 pr-4">Customer</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Items</th>
                  <th className="pb-2 pr-4">Total</th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 text-slate-800">{order.customerName}</td>
                    <td className="py-2 pr-4 text-slate-600">{order.status}</td>
                    <td className="py-2 pr-4 text-slate-600">{order.itemCount}</td>
                    <td className="py-2 pr-4 font-medium text-slate-800">
                      {formatCurrency(order.totalAmount, metrics.currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
