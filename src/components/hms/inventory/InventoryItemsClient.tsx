"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
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
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import type {
  InventoryCategoryRow,
  InventoryItemRow,
  InventoryItemTypeRow,
  InventoryUnitRow,
} from "@/lib/hms/inventory-types";

const NO_PARENT = "__none__";
const NO_CATEGORY = "__none__";

type ItemFormState = {
  sku: string;
  name: string;
  categoryId: string;
  unitOfMeasureId: string;
  itemTypeId: string;
  unitCost: string;
  barcode: string;
};

function emptyItemForm(units: InventoryUnitRow[], itemTypes: InventoryItemTypeRow[]): ItemFormState {
  return {
    sku: "",
    name: "",
    categoryId: NO_CATEGORY,
    unitOfMeasureId: units[0]?.id ?? "",
    itemTypeId: itemTypes[0]?.id ?? "",
    unitCost: "",
    barcode: "",
  };
}

export function InventoryItemsClient({
  slug,
  initialCategories,
  initialItems,
  initialUnits,
  initialItemTypes,
}: {
  slug: string;
  initialCategories: InventoryCategoryRow[];
  initialItems: InventoryItemRow[];
  initialUnits: InventoryUnitRow[];
  initialItemTypes: InventoryItemTypeRow[];
}) {
  const router = useRouter();
  const categories = initialCategories;
  const items = initialItems;
  const units = initialUnits;
  const itemTypes = initialItemTypes;

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.name);
    return map;
  }, [categories]);

  // --- Category form state ---
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState(NO_PARENT);
  const [savingCategory, setSavingCategory] = useState(false);
  const [renamingCategoryId, setRenamingCategoryId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusyId, setRenameBusyId] = useState<string | null>(null);
  const [deleteBusyId, setDeleteBusyId] = useState<string | null>(null);

  const addCategory = async () => {
    if (!newCategoryName.trim()) {
      toastError("Category name required");
      return;
    }
    setSavingCategory(true);
    try {
      const res = await fetch("/api/hotel/inventory/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: newCategoryName.trim(),
          parentId: newCategoryParentId === NO_PARENT ? null : newCategoryParentId,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add category", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Category added");
      setNewCategoryName("");
      setNewCategoryParentId(NO_PARENT);
      router.refresh();
    } finally {
      setSavingCategory(false);
    }
  };

  const startRename = (categoryId: string, currentName: string) => {
    setRenamingCategoryId(categoryId);
    setRenameValue(currentName);
  };

  const cancelRename = () => {
    setRenamingCategoryId(null);
    setRenameValue("");
  };

  const saveRename = async (categoryId: string) => {
    if (!renameValue.trim()) {
      toastError("Category name required");
      return;
    }
    setRenameBusyId(categoryId);
    try {
      const res = await fetch(`/api/hotel/inventory/categories/${categoryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: renameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not rename category", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Category renamed");
      cancelRename();
      router.refresh();
    } finally {
      setRenameBusyId(null);
    }
  };

  const removeCategory = async (categoryId: string) => {
    if (!window.confirm("Delete this category? Items in it will keep their data but lose the category link.")) {
      return;
    }
    setDeleteBusyId(categoryId);
    try {
      const res = await fetch(`/api/hotel/inventory/categories/${categoryId}?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not delete category", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Category deleted");
      router.refresh();
    } finally {
      setDeleteBusyId(null);
    }
  };

  // --- Items filters ---
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(NO_CATEGORY);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== NO_CATEGORY && item.category_id !== categoryFilter) return false;
      if (!term) return true;
      return item.name.toLowerCase().includes(term) || item.sku.toLowerCase().includes(term);
    });
  }, [items, search, categoryFilter]);

  // --- Item dialog (create / edit) ---
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(() => emptyItemForm(units, itemTypes));
  const [savingItem, setSavingItem] = useState(false);
  const [toggleBusyId, setToggleBusyId] = useState<string | null>(null);

  const openCreateDialog = () => {
    setEditingItemId(null);
    setItemForm(emptyItemForm(units, itemTypes));
    setDialogOpen(true);
  };

  const openEditDialog = (item: InventoryItemRow) => {
    setEditingItemId(item.id);
    setItemForm({
      sku: item.sku,
      name: item.name,
      categoryId: item.category_id ?? NO_CATEGORY,
      unitOfMeasureId: item.unit_of_measure,
      itemTypeId: item.item_type,
      unitCost: String(item.unit_cost ?? 0),
      barcode: item.barcode ?? "",
    });
    setDialogOpen(true);
  };

  const saveItem = async () => {
    if (!itemForm.name.trim() || (!editingItemId && !itemForm.sku.trim())) {
      toastError("Name and SKU are required");
      return;
    }
    if (!itemForm.unitOfMeasureId || !itemForm.itemTypeId) {
      toastError("Unit of measure and item type are required", "Add one under Settings first if the lists are empty.");
      return;
    }
    setSavingItem(true);
    try {
      const unitCostNum = itemForm.unitCost.trim() === "" ? undefined : Number(itemForm.unitCost);
      if (unitCostNum !== undefined && Number.isNaN(unitCostNum)) {
        toastError("Unit cost must be a number");
        return;
      }

      const payload = {
        slug,
        name: itemForm.name.trim(),
        categoryId: itemForm.categoryId === NO_CATEGORY ? null : itemForm.categoryId,
        unitOfMeasureId: itemForm.unitOfMeasureId,
        itemTypeId: itemForm.itemTypeId,
        unitCost: unitCostNum,
        barcode: itemForm.barcode.trim() || null,
      };

      const res = await fetch(
        editingItemId ? `/api/hotel/inventory/items/${editingItemId}` : "/api/hotel/inventory/items",
        {
          method: editingItemId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editingItemId ? payload : { ...payload, sku: itemForm.sku.trim() }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(editingItemId ? "Could not update item" : "Could not create item", data.error ?? "Try again.");
        return;
      }
      toastSuccess(editingItemId ? "Item updated" : "Item created");
      setDialogOpen(false);
      router.refresh();
    } finally {
      setSavingItem(false);
    }
  };

  const toggleActive = async (item: InventoryItemRow) => {
    setToggleBusyId(item.id);
    try {
      const res = await fetch(`/api/hotel/inventory/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, isActive: !item.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update item", data.error ?? "Try again.");
        return;
      }
      toastSuccess(item.is_active ? "Item marked inactive" : "Item marked active");
      router.refresh();
    } finally {
      setToggleBusyId(null);
    }
  };

  return (
    <div className="mt-2 space-y-6">
      {/* Categories */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-semibold text-slate-900">Categories</h2>
            <SettingsSectionInfo
              title="Categories"
              text="How the item catalog is grouped for browsing and stock reporting (e.g. Linen, Beverages, Cleaning supplies). Add a new one whenever you start stocking a new kind of item — this is a normal, ongoing task, not a rare one."
            />
          </div>
          <p className="mt-0.5 text-xs text-slate-500">Group items for easier browsing and stock reporting.</p>
        </div>

        <div className="flex flex-wrap items-end gap-2 px-6 py-4">
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="e.g. Linen"
            />
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-slate-600">Parent (optional)</label>
            <Select value={newCategoryParentId} onValueChange={setNewCategoryParentId}>
              <SelectTrigger>
                <SelectValue placeholder="No parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PARENT}>No parent</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" onClick={() => void addCategory()} disabled={savingCategory}>
            {savingCategory ? "Adding…" : "Add category"}
          </Button>
        </div>

        {categories.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-slate-500">No categories yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 px-6 pb-2">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                {renamingCategoryId === c.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="w-56"
                      autoFocus
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void saveRename(c.id)}
                      disabled={renameBusyId === c.id}
                    >
                      Save
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={cancelRename}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="font-medium text-slate-900">{c.name}</span>
                      {c.parent_id ? (
                        <span className="ml-2 text-xs text-slate-500">
                          under {categoryNameById.get(c.parent_id) ?? "—"}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => startRename(c.id, c.name)}>
                        Rename
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        onClick={() => void removeCategory(c.id)}
                        disabled={deleteBusyId === c.id}
                      >
                        Delete
                      </Button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Items */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-sm font-semibold text-slate-900">Items</h2>
              <SettingsSectionInfo
                title="Items"
                text="The master catalog of trackable stock items — name, SKU, category, unit, and cost. Add new items and mark ones inactive here whenever your stock lineup changes; this is regular, day-to-day upkeep."
              />
            </div>
            <p className="mt-0.5 text-xs text-slate-500">Master list of trackable stock items.</p>
          </div>
          <Button type="button" onClick={openCreateDialog}>
            New item
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 py-4">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU"
            className="w-64"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_CATEGORY}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filteredItems.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-slate-500">No items found.</p>
        ) : (
          <div className="overflow-x-auto px-6 pb-6">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4">SKU</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Unit</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Unit cost</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-4 font-mono text-xs text-slate-600">{item.sku}</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-900">{item.name}</td>
                    <td className="py-2.5 pr-4 text-slate-600">
                      {item.category_id ? categoryNameById.get(item.category_id) ?? "—" : "—"}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{item.unit_of_measure_name}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{item.item_type_name}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{item.unit_cost.toFixed(2)}</td>
                    <td className="py-2.5 pr-4">
                      <Button
                        type="button"
                        size="sm"
                        variant={item.is_active ? "outline" : "secondary"}
                        onClick={() => void toggleActive(item)}
                        disabled={toggleBusyId === item.id}
                        className={item.is_active ? "text-emerald-700" : "text-slate-500"}
                      >
                        {item.is_active ? "Active" : "Inactive"}
                      </Button>
                    </td>
                    <td className="py-2.5 pr-4 text-right">
                      <Button type="button" size="sm" variant="ghost" onClick={() => openEditDialog(item)}>
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItemId ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className={editingItemId ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs font-medium text-slate-600">SKU</label>
              <Input
                value={itemForm.sku}
                onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))}
                disabled={Boolean(editingItemId)}
                placeholder="e.g. LIN-0001"
              />
            </div>
            <div className={editingItemId ? "sm:col-span-2" : ""}>
              <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
              <Input
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Bath towel"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Category</label>
              <Select
                value={itemForm.categoryId}
                onValueChange={(v) => setItemForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="No category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CATEGORY}>No category</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Unit of measure</label>
              <Select
                value={itemForm.unitOfMeasureId}
                onValueChange={(v) => setItemForm((f) => ({ ...f, unitOfMeasureId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={units.length ? "Select a unit" : "Add a unit in Settings first"} />
                </SelectTrigger>
                <SelectContent>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Item type</label>
              <Select
                value={itemForm.itemTypeId}
                onValueChange={(v) => setItemForm((f) => ({ ...f, itemTypeId: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder={itemTypes.length ? "Select a type" : "Add a type in Settings first"} />
                </SelectTrigger>
                <SelectContent>
                  {itemTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Unit cost</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={itemForm.unitCost}
                onChange={(e) => setItemForm((f) => ({ ...f, unitCost: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Barcode (optional)</label>
              <Input
                value={itemForm.barcode}
                onChange={(e) => setItemForm((f) => ({ ...f, barcode: e.target.value }))}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void saveItem()} disabled={savingItem}>
              {savingItem ? "Saving…" : editingItemId ? "Save changes" : "Create item"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
