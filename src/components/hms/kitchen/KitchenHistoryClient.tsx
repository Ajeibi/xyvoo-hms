"use client";

import { useCallback, useState } from "react";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import type { KitchenHistoryRow } from "@/lib/hms/load-fb-pages";

function prepMinutes(row: KitchenHistoryRow) {
  if (!row.sent_to_kitchen_at) return "—";
  const end = new Date(row.closed_at ?? row.voided_at ?? row.created_at).getTime();
  const start = new Date(row.sent_to_kitchen_at).getTime();
  return `${Math.max(0, Math.round((end - start) / 60000))}m`;
}

export function KitchenHistoryClient({
  slug,
  tenantId,
  initial,
}: {
  slug: string;
  tenantId: string;
  initial: { rows: KitchenHistoryRow[] };
}) {
  const [rows, setRows] = useState<KitchenHistoryRow[]>(initial.rows);

  const load = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/kitchen/history?slug=${encodeURIComponent(slug)}`);
    const data = await res.json();
    if (res.ok) setRows(data.orders ?? []);
  }, [slug]);

  useFbRealtime(tenantId, () => void load());

  return (
    <div className="mx-auto max-w-[1000px] px-6 py-6">
      <h1 className="text-xl font-semibold text-slate-900">Order history</h1>
      <p className="text-sm text-slate-500">Today&apos;s completed and voided tickets (read-only).</p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Table</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Items</th>
              <th className="px-4 py-3">Kitchen time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  No tickets yet today.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 font-medium">#{row.order_number}</td>
                  <td className="px-4 py-3">{row.table_label}</td>
                  <td className="px-4 py-3 capitalize">{row.status}</td>
                  <td className="px-4 py-3">{row.item_count}</td>
                  <td className="px-4 py-3 tabular-nums">{prepMinutes(row)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
