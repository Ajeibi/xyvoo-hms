"use client";

import { useCallback, useState } from "react";
import type { FbOrderWithItems, FbTableRow } from "@/lib/hms/fb-types";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { cn } from "@/lib/utils";

export function FbTablesClient({
  slug,
  tenantId,
  initial,
}: {
  slug: string;
  tenantId: string;
  initial: { tables: FbTableRow[]; orders: FbOrderWithItems[] };
}) {
  const [tables] = useState<FbTableRow[]>(initial.tables);
  const [orders, setOrders] = useState<FbOrderWithItems[]>(initial.orders);

  const loadOrders = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const ord = await res.json();
    if (res.ok) setOrders(ord.orders ?? []);
  }, [slug]);

  useFbRealtime(tenantId, () => void loadOrders());

  const orderByTable = new Map(
    orders.filter((o) => o.table_id).map((o) => [o.table_id as string, o]),
  );

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-6">
      <h1 className="text-xl font-semibold text-slate-900">Tables</h1>
      <p className="mt-1 text-sm text-slate-500">Restaurant table status and open orders.</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {tables.map((table) => {
          const order = orderByTable.get(table.id);
          const status = order ? "seated" : table.status;
          return (
            <div
              key={table.id}
              className={cn(
                "rounded-2xl border p-4",
                status === "available" && "border-emerald-200 bg-emerald-50",
                status === "seated" && "border-blue-200 bg-blue-50",
                status === "dirty" && "border-amber-200 bg-amber-50",
              )}
            >
              <p className="text-lg font-bold text-slate-900">{table.table_code}</p>
              <p className="text-xs capitalize text-slate-600">{status}</p>
              <p className="mt-1 text-xs text-slate-500">{table.covers} covers</p>
              {order ? (
                <p className="mt-2 text-xs font-medium text-blue-700">#{order.order_number}</p>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
