"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type {
  InventoryItemRow,
  InventoryLocationRow,
  InventoryStockLevelWithDetails,
} from "@/lib/hms/inventory-types";

function formatNumber(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isLowStock(level: InventoryStockLevelWithDetails) {
  return level.reorder_point > 0 && level.qty_on_hand <= level.reorder_point;
}

async function saveParReorder(payload: {
  slug: string;
  itemId: string;
  locationId: string;
  parLevel: number;
  reorderPoint: number;
  reorderQty: number;
}) {
  const res = await fetch("/api/hotel/inventory/stock-levels", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error as string | undefined };
}

function StockRow({
  slug,
  level,
  onSaved,
}: {
  slug: string;
  level: InventoryStockLevelWithDetails;
  onSaved: () => void;
}) {
  const [parLevel, setParLevel] = useState(String(level.par_level));
  const [reorderPoint, setReorderPoint] = useState(String(level.reorder_point));
  const [reorderQty, setReorderQty] = useState(String(level.reorder_qty));
  const [saving, setSaving] = useState(false);

  const dirty =
    Number(parLevel) !== level.par_level ||
    Number(reorderPoint) !== level.reorder_point ||
    Number(reorderQty) !== level.reorder_qty;

  const low = isLowStock(level);
  const stockValue = level.qty_on_hand * level.unit_cost;

  const save = async () => {
    setSaving(true);
    try {
      const { ok, error } = await saveParReorder({
        slug,
        itemId: level.item_id,
        locationId: level.location_id,
        parLevel: Number(parLevel) || 0,
        reorderPoint: Number(reorderPoint) || 0,
        reorderQty: Number(reorderQty) || 0,
      });
      if (!ok) {
        toastError("Could not update stock control", error ?? "Try again.");
        return;
      }
      toastSuccess(`${level.item_name} updated`);
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className={low ? "bg-amber-50" : undefined}>
      <td className="whitespace-nowrap px-4 py-3">
        <p className="font-medium text-slate-900">{level.item_name}</p>
        <p className="text-xs text-slate-500">{level.item_sku}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{level.location_name}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
        {formatNumber(level.qty_on_hand)}
        {low ? (
          <span className="ml-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
            Low stock
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{level.unit_of_measure}</td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min="0"
          step="any"
          value={parLevel}
          onChange={(e) => setParLevel(e.target.value)}
          className="w-24"
        />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min="0"
          step="any"
          value={reorderPoint}
          onChange={(e) => setReorderPoint(e.target.value)}
          className="w-24"
        />
      </td>
      <td className="px-4 py-3">
        <Input
          type="number"
          min="0"
          step="any"
          value={reorderQty}
          onChange={(e) => setReorderQty(e.target.value)}
          className="w-24"
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
        {formatNumber(stockValue)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="rounded-lg"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </td>
    </tr>
  );
}

export function InventoryStockClient({
  slug,
  stockLevels,
  locations,
  items,
}: {
  slug: string;
  stockLevels: InventoryStockLevelWithDetails[];
  locations: InventoryLocationRow[];
  items: InventoryItemRow[];
}) {
  const [rows, setRows] = useState(stockLevels);
  const [locationFilter, setLocationFilter] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [loading, setLoading] = useState(false);

  const [setupOpen, setSetupOpen] = useState(false);
  const [setupItemId, setSetupItemId] = useState("");
  const [setupLocationId, setSetupLocationId] = useState("");
  const [setupPar, setSetupPar] = useState("0");
  const [setupReorderPoint, setSetupReorderPoint] = useState("0");
  const [setupReorderQty, setSetupReorderQty] = useState("0");
  const [setupSubmitting, setSetupSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ slug });
      if (locationFilter) params.set("locationId", locationFilter);
      if (onlyLowStock) params.set("onlyLowStock", "true");
      const res = await fetch(`/api/hotel/inventory/stock-levels?${params}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setRows(data.stockLevels ?? []);
    } finally {
      setLoading(false);
    }
  }, [slug, locationFilter, onlyLowStock]);

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(t);
  }, [refresh]);

  const resetSetupForm = () => {
    setSetupItemId("");
    setSetupLocationId("");
    setSetupPar("0");
    setSetupReorderPoint("0");
    setSetupReorderQty("0");
  };

  const canSubmitSetup = setupItemId.length > 0 && setupLocationId.length > 0;

  const submitSetup = async () => {
    setSetupSubmitting(true);
    try {
      const { ok, error } = await saveParReorder({
        slug,
        itemId: setupItemId,
        locationId: setupLocationId,
        parLevel: Number(setupPar) || 0,
        reorderPoint: Number(setupReorderPoint) || 0,
        reorderQty: Number(setupReorderQty) || 0,
      });
      if (!ok) {
        toastError("Could not set stock control", error ?? "Try again.");
        return;
      }
      toastSuccess("Par & reorder levels saved");
      setSetupOpen(false);
      resetSetupForm();
      void refresh();
    } finally {
      setSetupSubmitting(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={onlyLowStock}
              onChange={(e) => setOnlyLowStock(e.target.checked)}
              className="rounded"
            />
            Low stock only
          </label>
        </div>
        <Button
          type="button"
          variant="outline"
          className="rounded-lg"
          onClick={() => setSetupOpen(true)}
          disabled={items.length === 0 || locations.length === 0}
        >
          <Settings2 className="h-4 w-4" />
          Set par &amp; reorder
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Stock on hand</h2>
        </div>
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            {loading ? "Loading stock levels…" : "No stock levels match these filters yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 text-right">Qty on hand</th>
                  <th className="px-4 py-3">Unit</th>
                  <th className="px-4 py-3">Par level</th>
                  <th className="px-4 py-3">Reorder point</th>
                  <th className="px-4 py-3">Reorder qty</th>
                  <th className="px-4 py-3 text-right">Stock value</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((level) => (
                  <StockRow
                    key={`${level.id}:${level.par_level}:${level.reorder_point}:${level.reorder_qty}`}
                    slug={slug}
                    level={level}
                    onSaved={() => void refresh()}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={setupOpen}
        onOpenChange={(next) => {
          setSetupOpen(next);
          if (!next) resetSetupForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set par &amp; reorder levels</DialogTitle>
            <DialogDescription>
              Define stock controls for an item at a store, even before any stock has been received.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Item</label>
                <Select value={setupItemId} onValueChange={setSetupItemId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select item" />
                  </SelectTrigger>
                  <SelectContent>
                    {items.map((i) => (
                      <SelectItem key={i.id} value={i.id}>
                        {i.name} ({i.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Store location</label>
                <Select value={setupLocationId} onValueChange={setSetupLocationId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select store" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Par level</label>
                <Input type="number" min="0" step="any" value={setupPar} onChange={(e) => setSetupPar(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Reorder point</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={setupReorderPoint}
                  onChange={(e) => setSetupReorderPoint(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Reorder qty</label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={setupReorderQty}
                  onChange={(e) => setSetupReorderQty(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSetupOpen(false)} disabled={setupSubmitting}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmitSetup || setupSubmitting} onClick={() => void submitSetup()}>
              {setupSubmitting ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
