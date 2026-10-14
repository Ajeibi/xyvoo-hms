"use client";

import { useCallback, useEffect, useState } from "react";
import { Armchair, Loader2, Plus, Sparkles, Trash2, Users, X } from "lucide-react";
import type { FbOrderWithItems, FbTableRow } from "@/lib/hms/fb-types";
import type { FbRoleCapabilities } from "@/lib/hms/fb-rbac";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import {
  HmsCard,
  HmsEmptyState,
  HmsField,
  HmsPageHeader,
  HmsPill,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";
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

const TABLE_STATUS_LABEL: Record<string, string> = {
  available: "Free",
  seated: "Seated",
  dirty: "Needs clearing",
};

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

  const tableStatus = (table: FbTableRow) => (orderByTable.has(table.id) ? "seated" : table.status);
  const freeCount = tables.filter((t) => tableStatus(t) === "available").length;
  const seatedCount = tables.filter((t) => tableStatus(t) === "seated").length;
  const dirtyCount = tables.filter((t) => tableStatus(t) === "dirty").length;

  return (
    <div className="w-full space-y-6 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Restaurant & bar"
        meaning="food"
        title="Tables"
        description="Which tables are free, who is seated and which have an open order."
        actions={
          canManage ? (
            <button
              type="button"
              aria-expanded={adding}
              aria-controls="fb-add-table"
              onClick={() => setAdding((v) => !v)}
              className={adding ? hmsButton.secondary : hmsButton.primary}
            >
              {adding ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
              {adding ? "Close" : "Add table"}
            </button>
          ) : null
        }
      />

      {tables.length > 0 ? (
        <HmsStatStrip label="Tables at a glance" columns={3}>
          <HmsStatTile label="Free" value={freeCount} hint="Ready for the next guests" icon={Armchair} meaning="food" />
          <HmsStatTile label="Seated" value={seatedCount} hint="Guests at the table now" icon={Users} meaning="guests" />
          <HmsStatTile label="Needs clearing" value={dirtyCount} hint="Clear and reset before seating" icon={Sparkles} meaning="care" />
        </HmsStatStrip>
      ) : null}

      {canManage && adding ? (
        <HmsCard id="fb-add-table" title="Add a table" icon={Plus} meaning="food">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <HmsField id="fb-table-code" label="Table code">
                <input
                  id="fb-table-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="T7"
                  maxLength={20}
                  disabled={busy}
                  className={hmsInput}
                />
              </HmsField>
            </div>
            <div className="w-28">
              <HmsField id="fb-table-covers" label="Covers">
                <input
                  id="fb-table-covers"
                  type="number"
                  min={1}
                  max={30}
                  value={covers}
                  onChange={(e) => setCovers(e.target.value)}
                  disabled={busy}
                  className={hmsInput}
                />
              </HmsField>
            </div>
            <button type="button" onClick={() => void addTable()} disabled={busy} className={hmsButton.primary}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save table
            </button>
          </div>
        </HmsCard>
      ) : null}

      {tables.length === 0 ? (
        <HmsEmptyState
          art="basket"
          meaning="food"
          title="No tables yet"
          description={
            canManage
              ? "Add your restaurant tables so staff can link orders to a seat."
              : "Tables appear here once a manager adds them."
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {tables.map((table) => {
            const order = orderByTable.get(table.id);
            const status = order ? "seated" : table.status;
            return (
              <li
                key={table.id}
                className={cn(
                  "relative rounded-2xl border p-4",
                  status === "available" && "border-emerald-200 bg-emerald-50",
                  status === "seated" && "border-amber-200 bg-amber-50",
                  status === "dirty" && "border-violet-200 bg-violet-50",
                  !["available", "seated", "dirty"].includes(status) && "border-slate-200 bg-white",
                )}
              >
                {canManage && !order ? (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(table)}
                    aria-label={`Delete table ${table.table_code}`}
                    className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-white hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                ) : null}
                <p className="font-heading text-lg font-bold text-slate-900">{table.table_code}</p>
                <p className="mt-1">
                  <HmsPill tone={status === "available" ? "green" : status === "seated" ? "amber" : "slate"}>
                    {TABLE_STATUS_LABEL[status] ?? status.replace(/_/g, " ")}
                  </HmsPill>
                </p>
                <p className="mt-2 text-sm text-slate-700">{table.covers} covers</p>
                {order ? (
                  <p className="mt-1 text-sm font-medium text-orange-800">Order #{order.order_number}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

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
