"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { FbOrderWithItems, FbTableRow } from "@/lib/hms/fb-types";
import type { FbRoleCapabilities } from "@/lib/hms/fb-rbac";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { cn } from "@/lib/utils";

export function FbTablesClient({
  slug,
  tenantId,
  outletId,
  initial,
}: {
  slug: string;
  tenantId: string;
  outletId?: string | null;
  initial: { tables: FbTableRow[]; orders: FbOrderWithItems[] };
}) {
  const [tables, setTables] = useState<FbTableRow[]>(initial.tables);
  const [orders, setOrders] = useState<FbOrderWithItems[]>(initial.orders);
  const [canManage, setCanManage] = useState(false);
  const [resolvedOutletId, setResolvedOutletId] = useState<string | null>(outletId ?? null);

  const [adding, setAdding] = useState(false);
  const [code, setCode] = useState("");
  const [covers, setCovers] = useState("4");
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FbTableRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadOrders = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/orders?slug=${encodeURIComponent(slug)}`);
    const ord = await res.json();
    if (res.ok) setOrders(ord.orders ?? []);
  }, [slug]);

  const loadConfig = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/config?slug=${encodeURIComponent(slug)}&seed=0`);
    const data = await res.json();
    if (!res.ok) return;

    const caps = data.capabilities as FbRoleCapabilities | undefined;
    if (caps) setCanManage(Boolean(caps.canConfigure));

    const restaurant = (data.outlets ?? []).find(
      (o: { outlet_type: string }) => o.outlet_type === "restaurant",
    );
    const restaurantId: string | null = restaurant?.id ?? data.outlets?.[0]?.id ?? null;
    setResolvedOutletId(restaurantId);

    const all = (data.tables ?? []) as FbTableRow[];
    setTables(restaurantId ? all.filter((t) => t.outlet_id === restaurantId) : all);
  }, [slug]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useFbRealtime(tenantId, () => void loadOrders());

  const orderByTable = new Map(
    orders.filter((o) => o.table_id).map((o) => [o.table_id as string, o]),
  );

  const addTable = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toastError("Table code required", "Enter a code like T7.");
      return;
    }
    const coversNum = Number.parseInt(covers, 10);
    if (!Number.isFinite(coversNum) || coversNum < 1 || coversNum > 30) {
      toastError("Invalid covers", "Enter 1–30 covers.");
      return;
    }
    if (!resolvedOutletId) {
      toastError("No outlet", "Create a restaurant outlet in menu setup first.");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/hotel/fb/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        type: "table",
        outletId: resolvedOutletId,
        tableCode: trimmed,
        covers: coversNum,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      toastError("Could not add table", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Table added", `${trimmed} is now available.`);
    setCode("");
    setCovers("4");
    setAdding(false);
    await loadConfig();
  };

  const deleteTable = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const res = await fetch("/api/hotel/fb/menu", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, type: "table", id: deleteTarget.id }),
    });
    const data = await res.json();
    setDeleting(false);
    if (!res.ok) {
      toastError("Could not delete table", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Table deleted", `${deleteTarget.table_code} was removed.`);
    setDeleteTarget(null);
    await loadConfig();
  };

  return (
    <div className="w-full px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Tables</h1>
          <p className="mt-1 text-sm text-slate-500">Restaurant table status and open orders.</p>
        </div>
        {canManage ? (
          <Button
            type="button"
            variant={adding ? "secondary" : "default"}
            onClick={() => setAdding((v) => !v)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {adding ? "Close" : "Add table"}
          </Button>
        ) : null}
      </div>

      {canManage && adding ? (
        <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-slate-600">Table code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="T7"
              maxLength={20}
              disabled={busy}
              className="rounded-xl"
            />
          </div>
          <div className="w-24">
            <label className="mb-1 block text-xs font-medium text-slate-600">Covers</label>
            <Input
              type="number"
              min={1}
              max={30}
              value={covers}
              onChange={(e) => setCovers(e.target.value)}
              disabled={busy}
              className="rounded-xl"
            />
          </div>
          <Button type="button" onClick={() => void addTable()} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save table
          </Button>
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {tables.length === 0 ? (
          <p className="col-span-full rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            No tables yet.
          </p>
        ) : (
          tables.map((table) => {
            const order = orderByTable.get(table.id);
            const status = order ? "seated" : table.status;
            return (
              <div
                key={table.id}
                className={cn(
                  "relative rounded-2xl border p-4",
                  status === "available" && "border-emerald-200 bg-emerald-50",
                  status === "seated" && "border-blue-200 bg-blue-50",
                  status === "dirty" && "border-amber-200 bg-amber-50",
                )}
              >
                {canManage && !order ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(table)}
                    title="Delete table"
                    className="absolute right-2 top-2 rounded-lg p-1 text-slate-400 transition-colors hover:bg-white hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
                <p className="text-lg font-bold text-slate-900">{table.table_code}</p>
                <p className="text-xs capitalize text-slate-600">{status}</p>
                <p className="mt-1 text-xs text-slate-500">{table.covers} covers</p>
                {order ? (
                  <p className="mt-2 text-xs font-medium text-blue-700">#{order.order_number}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete table {deleteTarget?.table_code}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the table from the floor plan and POS. Open orders are unaffected. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void deleteTable();
              }}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
