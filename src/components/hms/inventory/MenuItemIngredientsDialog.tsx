"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";

type InventoryItemOption = { id: string; name: string; sku: string; unit_of_measure_name: string };

type IngredientRow = { inventoryItemId: string; qtyPerServing: string };

/**
 * Recipe / BOM editor for a single saved F&B menu item — links it to
 * inventory items so a served ticket can auto-deduct stock. Standalone:
 * fetches/saves directly against its own API route, independent of the
 * Menu Setup batch-save draft state.
 */
export function MenuItemIngredientsDialog({
  slug,
  menuItemId,
  menuItemName,
}: {
  slug: string;
  menuItemId: string;
  menuItemName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<InventoryItemOption[]>([]);
  const [rows, setRows] = useState<IngredientRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/hotel/inventory/items?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
      fetch(`/api/hotel/fb/menu-items/${menuItemId}/ingredients?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
    ])
      .then(([itemsData, ingredientsData]) => {
        setItems(itemsData.items ?? []);
        const existing = (ingredientsData.ingredients ?? []) as {
          inventory_item_id: string;
          qty_per_serving: number;
        }[];
        setRows(
          existing.length
            ? existing.map((i) => ({ inventoryItemId: i.inventory_item_id, qtyPerServing: String(i.qty_per_serving) }))
            : [{ inventoryItemId: "", qtyPerServing: "" }],
        );
      })
      .catch(() => toastError("Could not load ingredients"))
      .finally(() => setLoading(false));
  }, [open, slug, menuItemId]);

  const addRow = () => setRows((r) => [...r, { inventoryItemId: "", qtyPerServing: "" }]);
  const updateRow = (idx: number, patch: Partial<IngredientRow>) =>
    setRows((r) => r.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  const removeRow = (idx: number) => setRows((r) => r.filter((_, i) => i !== idx));

  const save = async () => {
    const payload = rows
      .filter((r) => r.inventoryItemId && Number(r.qtyPerServing) > 0)
      .map((r) => ({ inventoryItemId: r.inventoryItemId, qtyPerServing: Number(r.qtyPerServing) }));

    setSaving(true);
    try {
      const res = await fetch(`/api/hotel/fb/menu-items/${menuItemId}/ingredients`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ingredients: payload }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save ingredients", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Ingredients saved", `${menuItemName} will now auto-deduct stock when served.`);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="text-slate-600 hover:text-slate-800">
          Ingredients
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ingredients — {menuItemName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p className="py-6 text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-slate-500">
              Map this dish to inventory items and how much of each is used per serving. Once set, serving a
              ticket automatically deducts the stock.
            </p>
            {rows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={row.inventoryItemId}
                  onChange={(e) => updateRow(idx, { inventoryItemId: e.target.value })}
                  className="flex-1 rounded-md border border-slate-200 px-2 py-2 text-sm"
                >
                  <option value="">Select item…</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} ({item.sku})
                    </option>
                  ))}
                </select>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={row.qtyPerServing}
                  onChange={(e) => updateRow(idx, { qtyPerServing: e.target.value })}
                  placeholder="Qty"
                  className="w-24"
                />
                <span className="w-10 shrink-0 text-xs text-slate-500">
                  {items.find((i) => i.id === row.inventoryItemId)?.unit_of_measure_name ?? ""}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => removeRow(idx)} className="text-red-600">
                  Remove
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addRow}>
              + Add ingredient
            </Button>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void save()} disabled={loading || saving}>
            {saving ? "Saving…" : "Save ingredients"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
