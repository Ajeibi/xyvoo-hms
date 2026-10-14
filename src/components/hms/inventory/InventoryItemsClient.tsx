"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderTree, Package, Pencil, Plus, Trash2 } from "lucide-react";
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
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
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
    <div className="space-y-6">
      <HmsSectionIntro
        id="inventory-items"
        title="Your stock catalogue"
        meaning="stock"
        art="box"
        points={[
          "Group items into categories so stock is easy to find and report on.",
          "Add an item for everything you want to count, receive or issue.",
          "Mark items inactive when you stop stocking them. Their history is kept.",
        ]}
      />

      {/* Categories */}
      <HmsCard
        id="inventory-categories"
        title="Categories"
        description="Group items for easier browsing and stock reporting."
        icon={FolderTree}
        meaning="stock"
        flush
        actions={
          <SettingsSectionInfo
            title="Categories"
            text="How the item catalog is grouped for browsing and stock reporting (e.g. Linen, Beverages, Cleaning supplies). Add a new one whenever you start stocking a new kind of item — this is a normal, ongoing task, not a rare one."
          />
        }
      >
        <div className="flex flex-wrap items-end gap-3 px-5 py-4 sm:px-6">
          <div className="w-full sm:w-56">
            <HmsField id="inventory-category-name" label="Name">
              <input
                id="inventory-category-name"
                className={hmsInput}
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g. Linen"
              />
            </HmsField>
          </div>
          <div className="w-full sm:w-56">
            <HmsField id="inventory-category-parent" label="Parent" optional>
              <Select value={newCategoryParentId} onValueChange={setNewCategoryParentId}>
                <SelectTrigger id="inventory-category-parent" className="h-[42px] rounded-xl border-slate-300">
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
            </HmsField>
          </div>
          <button type="button" className={hmsButton.primary} onClick={() => void addCategory()} disabled={savingCategory}>
            <Plus className="h-4 w-4" aria-hidden />
            {savingCategory ? "Adding…" : "Add category"}
          </button>
        </div>

        {categories.length === 0 ? (
          <div className="border-t border-slate-100">
            <HmsEmptyState
              bare
              art="tag"
              meaning="stock"
              title="No categories yet"
              description="Add your first category above, such as Linen, Beverages or Cleaning supplies."
            />
          </div>
        ) : (
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {categories.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm sm:px-6">
                {renamingCategoryId === c.id ? (
                  <div className="flex flex-1 flex-wrap items-center gap-2">
                    <label htmlFor={`inventory-category-rename-${c.id}`} className="sr-only">
                      New name for {c.name}
                    </label>
                    <input
                      id={`inventory-category-rename-${c.id}`}
                      className={`${hmsInput} sm:w-64`}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      autoFocus
                    />
                    <button
                      type="button"
                      className={hmsButton.primary}
                      onClick={() => void saveRename(c.id)}
                      disabled={renameBusyId === c.id}
                    >
                      Save
                    </button>
                    <button type="button" className={hmsButton.secondary} onClick={cancelRename}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div>
                      <span className="font-medium text-slate-900">{c.name}</span>
                      {c.parent_id ? (
                        <span className="ml-2 text-sm text-slate-600">
                          under {categoryNameById.get(c.parent_id) ?? "—"}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" className={hmsButton.quiet} onClick={() => startRename(c.id, c.name)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                        Rename<span className="sr-only"> {c.name}</span>
                      </button>
                      <button
                        type="button"
                        className={hmsButton.danger}
                        onClick={() => void removeCategory(c.id)}
                        disabled={deleteBusyId === c.id}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                        Delete<span className="sr-only"> {c.name}</span>
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </HmsCard>

      {/* Items */}
      <HmsCard
        id="inventory-items-list"
        title="Items"
        description="The master list of stock items you track."
        icon={Package}
        meaning="stock"
        flush
        actions={
          <>
            <SettingsSectionInfo
              title="Items"
              text="The master catalog of trackable stock items — name, SKU, category, unit, and cost. Add new items and mark ones inactive here whenever your stock lineup changes; this is regular, day-to-day upkeep."
            />
            <button type="button" className={hmsButton.primary} onClick={openCreateDialog}>
              <Plus className="h-4 w-4" aria-hidden />
              New item
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-3 px-5 py-4 sm:px-6">
          <div className="w-full sm:w-72">
            <HmsField id="inventory-items-search" label="Search">
              <input
                id="inventory-items-search"
                type="search"
                className={hmsInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or SKU"
              />
            </HmsField>
          </div>
          <div className="w-full sm:w-60">
            <HmsField id="inventory-items-category" label="Category">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger id="inventory-items-category" className="h-[42px] rounded-xl border-slate-300">
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
            </HmsField>
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="border-t border-slate-100">
            {items.length === 0 ? (
              <HmsEmptyState
                bare
                art="box"
                meaning="stock"
                title="No items yet"
                description="Add the things you keep in stock, such as towels, soap or drinks."
                action={
                  <button type="button" className={hmsButton.primary} onClick={openCreateDialog}>
                    <Plus className="h-4 w-4" aria-hidden />
                    New item
                  </button>
                }
              />
            ) : (
              <HmsEmptyState bare art="box" meaning="stock" title="No items found" description="Try a different search or category." />
            )}
          </div>
        ) : (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-sm text-slate-600">
                  <th className="px-5 py-3 font-medium sm:pl-6">SKU</th>
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Category</th>
                  <th className="px-5 py-3 font-medium">Unit</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 text-right font-medium">Unit cost</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 text-right font-medium sm:pr-6">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 sm:pl-6">{item.sku}</td>
                    <td className="px-5 py-3 font-medium text-slate-900">{item.name}</td>
                    <td className="px-5 py-3 text-slate-700">
                      {item.category_id ? categoryNameById.get(item.category_id) ?? "—" : "—"}
                    </td>
                    <td className="px-5 py-3 text-slate-700">{item.unit_of_measure_name}</td>
                    <td className="px-5 py-3 text-slate-700">{item.item_type_name}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-slate-900">{item.unit_cost.toFixed(2)}</td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <HmsPill tone={item.is_active ? "green" : "slate"}>{item.is_active ? "Active" : "Inactive"}</HmsPill>
                        <button
                          type="button"
                          className={hmsButton.quiet}
                          onClick={() => void toggleActive(item)}
                          disabled={toggleBusyId === item.id}
                        >
                          {item.is_active ? "Mark inactive" : "Mark active"}
                          <span className="sr-only"> {item.name}</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right sm:pr-6">
                      <button type="button" className={hmsButton.quiet} onClick={() => openEditDialog(item)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                        Edit<span className="sr-only"> {item.name}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItemId ? "Edit item" : "New item"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className={editingItemId ? "sm:col-span-2" : ""}>
              <HmsField id="inventory-item-sku" label="SKU" hint={editingItemId ? "The SKU can't be changed once the item exists." : undefined}>
                <input
                  id="inventory-item-sku"
                  className={`${hmsInput} disabled:bg-slate-50 disabled:text-slate-600`}
                  value={itemForm.sku}
                  onChange={(e) => setItemForm((f) => ({ ...f, sku: e.target.value }))}
                  disabled={Boolean(editingItemId)}
                  placeholder="e.g. LIN-0001"
                  aria-describedby={editingItemId ? "inventory-item-sku-hint" : undefined}
                />
              </HmsField>
            </div>
            <div className={editingItemId ? "sm:col-span-2" : ""}>
              <HmsField id="inventory-item-name" label="Name">
                <input
                  id="inventory-item-name"
                  className={hmsInput}
                  value={itemForm.name}
                  onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Bath towel"
                />
              </HmsField>
            </div>
            <HmsField id="inventory-item-category" label="Category">
              <Select
                value={itemForm.categoryId}
                onValueChange={(v) => setItemForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger id="inventory-item-category" className="h-[42px] rounded-xl border-slate-300">
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
            </HmsField>
            <HmsField id="inventory-item-unit" label="Unit of measure">
              <Select
                value={itemForm.unitOfMeasureId}
                onValueChange={(v) => setItemForm((f) => ({ ...f, unitOfMeasureId: v }))}
              >
                <SelectTrigger id="inventory-item-unit" className="h-[42px] rounded-xl border-slate-300">
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
            </HmsField>
            <HmsField id="inventory-item-type" label="Item type">
              <Select
                value={itemForm.itemTypeId}
                onValueChange={(v) => setItemForm((f) => ({ ...f, itemTypeId: v }))}
              >
                <SelectTrigger id="inventory-item-type" className="h-[42px] rounded-xl border-slate-300">
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
            </HmsField>
            <HmsField id="inventory-item-cost" label="Unit cost">
              <input
                id="inventory-item-cost"
                className={hmsInput}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={itemForm.unitCost}
                onChange={(e) => setItemForm((f) => ({ ...f, unitCost: e.target.value }))}
                placeholder="0.00"
              />
            </HmsField>
            <HmsField id="inventory-item-barcode" label="Barcode" optional>
              <input
                id="inventory-item-barcode"
                className={hmsInput}
                value={itemForm.barcode}
                onChange={(e) => setItemForm((f) => ({ ...f, barcode: e.target.value }))}
              />
            </HmsField>
          </div>

          <DialogFooter>
            <button type="button" className={hmsButton.secondary} onClick={() => setDialogOpen(false)}>
              Cancel
            </button>
            <button type="button" className={hmsButton.primary} onClick={() => void saveItem()} disabled={savingItem}>
              {savingItem ? "Saving…" : editingItemId ? "Save changes" : "Create item"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
