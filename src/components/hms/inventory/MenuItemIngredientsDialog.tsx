"use client";

import { useEffect, useId, useState } from "react";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { hmsButton, hmsInput } from "@/components/hms/hms-ui";
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
  const uid = useId();
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
        <Button type="button" variant="ghost" size="sm" className="text-slate-700 hover:text-slate-900">
          Ingredients
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ingredients — {menuItemName}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <p role="status" className="py-6 text-sm text-slate-600">
            Loading…
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Map this dish to inventory items and how much of each is used per serving. Once set, serving a
              ticket automatically deducts the stock.
            </p>
            {rows.map((row, idx) => {
              const unit = items.find((i) => i.id === row.inventoryItemId)?.unit_of_measure_name ?? "";
              return (
                <div key={idx} className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`${uid}-item-${idx}`} className="mb-1 block text-sm font-medium text-slate-800">
                      Ingredient {idx + 1}
                    </label>
                    <select
                      id={`${uid}-item-${idx}`}
                      value={row.inventoryItemId}
                      onChange={(e) => updateRow(idx, { inventoryItemId: e.target.value })}
                      className={hmsInput}
                    >
                      <option value="">Select item…</option>
                      {items.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({item.sku})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <label htmlFor={`${uid}-qty-${idx}`} className="mb-1 block text-sm font-medium text-slate-800">
                      Per serving
                    </label>
                    <input
                      id={`${uid}-qty-${idx}`}
                      type="text"
                      inputMode="decimal"
                      value={row.qtyPerServing}
                      onChange={(e) => updateRow(idx, { qtyPerServing: e.target.value })}
                      placeholder="Qty"
                      className={hmsInput}
                    />
                  </div>
                  <span className="w-12 shrink-0 pb-3 text-sm text-slate-600">{unit}</span>
                  <button type="button" className={hmsButton.danger} onClick={() => removeRow(idx)}>
                    Remove<span className="sr-only"> ingredient {idx + 1}</span>
                  </button>
                </div>
              );
            })}
            <button type="button" className={hmsButton.secondary} onClick={addRow}>
              <Plus className="h-4 w-4" aria-hidden />
              Add ingredient
            </button>
          </div>
        )}

        <DialogFooter>
          <button type="button" className={hmsButton.secondary} onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} onClick={() => void save()} disabled={loading || saving}>
            {saving ? "Saving…" : "Save ingredients"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
