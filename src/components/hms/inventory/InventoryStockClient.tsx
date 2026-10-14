"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Boxes, CircleAlert, Coins, Package, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { InventoryItemPicker } from "@/components/hms/inventory/InventoryItemPicker";
import {
  HmsCard,
  HmsEmptyState,
  HmsField,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import type {
  InventoryItemRow,
  InventoryLocationRow,
  InventoryStockLevelWithDetails,
} from "@/lib/hms/inventory-types";

/** hmsInput without the full width, for the small number boxes inside table rows. */
const rowInput = hmsInput.replace("w-full ", "w-24 ").replace("py-2.5", "py-1.5").replace("px-4", "px-3");

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
  const rowName = `${level.item_name} at ${level.location_name}`;

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
    <tr className={low ? "bg-rose-50/60" : "hover:bg-slate-50"}>
      <td className="whitespace-nowrap px-4 py-3">
        <p className="font-medium text-slate-900">{level.item_name}</p>
        <p className="text-xs text-slate-600">{level.item_sku}</p>
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-700">{level.location_name}</td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
        {formatNumber(level.qty_on_hand)}
        {low ? (
          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
            <CircleAlert className="h-3 w-3" aria-hidden />
            Low stock
          </span>
        ) : null}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-slate-600">{level.unit_of_measure}</td>
      <td className="px-4 py-3">
        <input
          type="number"
          min="0"
          step="any"
          aria-label={`Par level for ${rowName}`}
          value={parLevel}
          onChange={(e) => setParLevel(e.target.value)}
          className={rowInput}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min="0"
          step="any"
          aria-label={`Reorder point for ${rowName}`}
          value={reorderPoint}
          onChange={(e) => setReorderPoint(e.target.value)}
          className={rowInput}
        />
      </td>
      <td className="px-4 py-3">
        <input
          type="number"
          min="0"
          step="any"
          aria-label={`Reorder quantity for ${rowName}`}
          value={reorderQty}
          onChange={(e) => setReorderQty(e.target.value)}
          className={rowInput}
        />
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-700">
        {formatNumber(stockValue)}
      </td>
      <td className="whitespace-nowrap px-4 py-3 text-right">
        <button
          type="button"
          className={`${hmsButton.secondary} px-3 py-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : "Save"}
          <span className="sr-only"> {rowName}</span>
        </button>
      </td>
    </tr>
  );
}

export function InventoryStockClient({
  slug,
  stockLevels,
  locations,
  items: initialItems,
  canCreateItem = false,
}: {
  slug: string;
  stockLevels: InventoryStockLevelWithDetails[];
  locations: InventoryLocationRow[];
  items: InventoryItemRow[];
  canCreateItem?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [rows, setRows] = useState(stockLevels);
  const [locationFilter, setLocationFilter] = useState("");
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  const filteredRows = (() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(
      (level) => level.item_name.toLowerCase().includes(term) || level.item_sku.toLowerCase().includes(term),
    );
  })();

  // Group by item so a per-item total across stores can sit above its per-location rows.
  const itemGroups = useMemo(() => {
    const map = new Map<string, InventoryStockLevelWithDetails[]>();
    for (const level of filteredRows) {
      const group = map.get(level.item_id) ?? [];
      group.push(level);
      map.set(level.item_id, group);
    }
    return [...map.values()];
  }, [filteredRows]);

  // Figures for the rows on screen, from data already loaded.
  const figures = useMemo(() => {
    const itemIds = new Set<string>();
    let value = 0;
    let low = 0;
    for (const level of rows) {
      itemIds.add(level.item_id);
      value += level.qty_on_hand * level.unit_cost;
      if (isLowStock(level)) low++;
    }
    return { items: itemIds.size, value, low };
  }, [rows]);

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

  const viewHint = onlyLowStock || locationFilter ? "In the current view" : "Across every store";

  return (
    <div className="space-y-6">
      <HmsSectionIntro
        id="inventory-stock"
        title="What you have, store by store"
        meaning="stock"
        art="box"
        points={[
          "See the live quantity of every item at each store, with its value.",
          "Set a par level and reorder point so low stock is flagged before you run out.",
          "You can set these levels before any stock has arrived.",
        ]}
      />

      <HmsStatStrip label="Stock figures" columns={3}>
        <HmsStatTile label="Items in stock" value={figures.items.toLocaleString()} hint={viewHint} icon={Package} meaning="stock" />
        <HmsStatTile label="Stock value" value={formatNumber(figures.value)} hint={viewHint} icon={Coins} meaning="money" />
        <HmsStatTile
          label="Low stock"
          value={figures.low.toLocaleString()}
          hint="At or below the reorder point"
          icon={CircleAlert}
          meaning="attention"
          status={figures.low > 0 ? "warning" : undefined}
          statusText={figures.low > 0 ? "At or below the reorder point" : undefined}
        />
      </HmsStatStrip>

      <HmsCard
        id="inventory-stock-levels"
        title="Stock on hand"
        description="Change a level in a row, then press Save on that row."
        icon={Boxes}
        meaning="stock"
        flush
        actions={
          <button
            type="button"
            className={`${hmsButton.secondary} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`}
            onClick={() => setSetupOpen(true)}
            disabled={items.length === 0 || locations.length === 0}
          >
            <Settings2 className="h-4 w-4" aria-hidden />
            Set par &amp; reorder
          </button>
        }
      >
        <div className="flex flex-wrap items-end gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="w-full sm:w-64">
            <label htmlFor="inventory-stock-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search
            </label>
            <input
              id="inventory-stock-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or SKU"
              className={hmsInput}
            />
          </div>
          <div className="w-full sm:w-52">
            <label htmlFor="inventory-stock-location" className="mb-1 block text-sm font-medium text-slate-800">
              Store
            </label>
            <Select value={locationFilter || "all"} onValueChange={(v) => setLocationFilter(v === "all" ? "" : v)}>
              <SelectTrigger id="inventory-stock-location" className="rounded-xl border-slate-300">
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
          </div>
          <HmsFilterChips
            label="Show"
            meaning="attention"
            value={onlyLowStock ? "low" : "all"}
            onChange={(v) => setOnlyLowStock(v === "low")}
            options={[
              { value: "all", label: "All stock" },
              { value: "low", label: "Low stock only" },
            ]}
          />
        </div>

        {filteredRows.length === 0 ? (
          loading ? (
            <p role="status" className="px-6 py-10 text-center text-sm text-slate-600">
              Loading stock levels…
            </p>
          ) : (
            <HmsEmptyState
              bare
              art="box"
              meaning="stock"
              title="Nothing to show yet"
              description="No stock levels match these filters. Receive stock, or set par and reorder levels for an item."
            />
          )
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-sm font-medium text-slate-600">
                  <th scope="col" className="px-4 py-3">Item</th>
                  <th scope="col" className="px-4 py-3">Location</th>
                  <th scope="col" className="px-4 py-3 text-right">Qty on hand</th>
                  <th scope="col" className="px-4 py-3">Unit</th>
                  <th scope="col" className="px-4 py-3">Par level</th>
                  <th scope="col" className="px-4 py-3">Reorder point</th>
                  <th scope="col" className="px-4 py-3">Reorder qty</th>
                  <th scope="col" className="px-4 py-3 text-right">Stock value</th>
                  <th scope="col" className="px-4 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemGroups.map((group) => {
                  const [first] = group;
                  const totalQty = group.reduce((sum, l) => sum + l.qty_on_hand, 0);
                  const totalValue = group.reduce((sum, l) => sum + l.qty_on_hand * l.unit_cost, 0);
                  return (
                    <Fragment key={first.item_id}>
                      {group.length > 1 ? (
                        <tr className="bg-teal-50/60">
                          <td className="whitespace-nowrap px-4 py-2 text-sm font-semibold text-slate-800" colSpan={2}>
                            {first.item_name} <span className="font-normal text-slate-600">· total across {group.length} stores</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatNumber(totalQty)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-2 text-sm text-slate-600">{first.unit_of_measure}</td>
                          <td colSpan={3} />
                          <td className="whitespace-nowrap px-4 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
                            {formatNumber(totalValue)}
                          </td>
                          <td />
                        </tr>
                      ) : null}
                      {group.map((level) => (
                        <StockRow
                          key={`${level.id}:${level.par_level}:${level.reorder_point}:${level.reorder_qty}`}
                          slug={slug}
                          level={level}
                          onSaved={() => void refresh()}
                        />
                      ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

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
              Set stock controls for an item at a store, even before any stock has been received.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-1 block text-sm font-medium text-slate-800">Item</p>
                <InventoryItemPicker
                  slug={slug}
                  items={items}
                  value={setupItemId}
                  onValueChange={setSetupItemId}
                  canCreateItem={canCreateItem}
                  onItemCreated={(item) => setItems((prev) => [...prev, item])}
                  placeholder="Select item"
                />
              </div>
              <HmsField id="inventory-stock-setup-location" label="Store location">
                <Select value={setupLocationId} onValueChange={setSetupLocationId}>
                  <SelectTrigger id="inventory-stock-setup-location" className="rounded-xl border-slate-300">
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
              </HmsField>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <HmsField id="inventory-stock-setup-par" label="Par level">
                <input
                  id="inventory-stock-setup-par"
                  type="number"
                  min="0"
                  step="any"
                  value={setupPar}
                  onChange={(e) => setSetupPar(e.target.value)}
                  className={hmsInput}
                />
              </HmsField>
              <HmsField id="inventory-stock-setup-reorder-point" label="Reorder point">
                <input
                  id="inventory-stock-setup-reorder-point"
                  type="number"
                  min="0"
                  step="any"
                  value={setupReorderPoint}
                  onChange={(e) => setSetupReorderPoint(e.target.value)}
                  className={hmsInput}
                />
              </HmsField>
              <HmsField id="inventory-stock-setup-reorder-qty" label="Reorder qty">
                <input
                  id="inventory-stock-setup-reorder-qty"
                  type="number"
                  min="0"
                  step="any"
                  value={setupReorderQty}
                  onChange={(e) => setSetupReorderQty(e.target.value)}
                  className={hmsInput}
                />
              </HmsField>
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
