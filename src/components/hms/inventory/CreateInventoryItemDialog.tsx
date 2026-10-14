"use client";

import { useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type {
  InventoryCategoryRow,
  InventoryItemRow,
  InventoryItemTypeRow,
  InventoryUnitRow,
} from "@/lib/hms/inventory-types";

const NO_CATEGORY = "__none__";
const SAME_AS_ISSUE_UNIT = "__same__";
const TRIGGER = "h-[42px] rounded-xl border-slate-300";

/**
 * Reusable "create a new item" dialog usable from anywhere an item picker
 * needs a quick-add escape hatch (Receiving, Requisitions, Transfers, Waste,
 * Stock levels). Self-fetches categories/units/item-types when opened so
 * callers don't need to pre-load that data.
 */
export function CreateInventoryItemDialog({
  slug,
  open,
  onOpenChange,
  onCreated,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (item: InventoryItemRow) => void;
}) {
  const uid = useId();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<InventoryCategoryRow[]>([]);
  const [units, setUnits] = useState<InventoryUnitRow[]>([]);
  const [itemTypes, setItemTypes] = useState<InventoryItemTypeRow[]>([]);

  const [sku, setSku] = useState("");
  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState(NO_CATEGORY);
  const [unitOfMeasureId, setUnitOfMeasureId] = useState("");
  const [purchaseUnitId, setPurchaseUnitId] = useState(SAME_AS_ISSUE_UNIT);
  const [purchaseToIssueFactor, setPurchaseToIssueFactor] = useState("1");
  const [itemTypeId, setItemTypeId] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      fetch(`/api/hotel/inventory/categories?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
      fetch(`/api/hotel/inventory/units?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
      fetch(`/api/hotel/inventory/item-types?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
    ])
      .then(([categoriesData, unitsData, itemTypesData]) => {
        const cats = (categoriesData.categories ?? []) as InventoryCategoryRow[];
        const us = (unitsData.units ?? []) as InventoryUnitRow[];
        // Fixed assets aren't stock — don't offer that type from a stock-flow quick-add.
        const types = ((itemTypesData.itemTypes ?? []) as InventoryItemTypeRow[]).filter((t) => !t.is_fixed_asset);
        setCategories(cats);
        setUnits(us);
        setItemTypes(types);
        setUnitOfMeasureId((prev) => prev || us[0]?.id || "");
        setItemTypeId((prev) => prev || types[0]?.id || "");
      })
      .catch(() => toastError("Could not load item setup options"))
      .finally(() => setLoading(false));
  }, [open, slug]);

  const resetForm = () => {
    setSku("");
    setName("");
    setCategoryId(NO_CATEGORY);
    setUnitCost("");
    setPurchaseUnitId(SAME_AS_ISSUE_UNIT);
    setPurchaseToIssueFactor("1");
  };

  const canSubmit = sku.trim().length > 0 && name.trim().length > 0 && Boolean(unitOfMeasureId) && Boolean(itemTypeId);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/inventory/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          sku: sku.trim(),
          name: name.trim(),
          categoryId: categoryId === NO_CATEGORY ? null : categoryId,
          unitOfMeasureId,
          purchaseUnitId: purchaseUnitId === SAME_AS_ISSUE_UNIT ? null : purchaseUnitId,
          purchaseToIssueFactor: purchaseUnitId === SAME_AS_ISSUE_UNIT ? undefined : Number(purchaseToIssueFactor) || 1,
          itemTypeId,
          unitCost: unitCost.trim() === "" ? undefined : Number(unitCost),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create item", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${data.item?.name ?? "Item"} created`);
      onCreated(data.item as InventoryItemRow);
      onOpenChange(false);
      resetForm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New item</DialogTitle>
          <DialogDescription>Add a new item to the catalog without leaving what you&apos;re doing.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p role="status" className="py-6 text-sm text-slate-600">
            Loading…
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <HmsField id={`${uid}-sku`} label="SKU">
              <input id={`${uid}-sku`} className={hmsInput} value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. LIN-0001" />
            </HmsField>
            <HmsField id={`${uid}-name`} label="Name">
              <input id={`${uid}-name`} className={hmsInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bath towel" />
            </HmsField>
            <HmsField id={`${uid}-category`} label="Category">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger id={`${uid}-category`} className={TRIGGER}>
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
            <HmsField id={`${uid}-unit`} label="Unit of measure">
              <Select value={unitOfMeasureId} onValueChange={setUnitOfMeasureId}>
                <SelectTrigger id={`${uid}-unit`} className={TRIGGER}>
                  <SelectValue />
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
            <HmsField id={`${uid}-purchase-unit`} label="Purchase unit" optional>
              <Select value={purchaseUnitId} onValueChange={setPurchaseUnitId}>
                <SelectTrigger id={`${uid}-purchase-unit`} className={TRIGGER}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SAME_AS_ISSUE_UNIT}>Same as unit of measure</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </HmsField>
            {purchaseUnitId !== SAME_AS_ISSUE_UNIT ? (
              <HmsField id={`${uid}-factor`} label="Units per purchase unit">
                <input
                  id={`${uid}-factor`}
                  className={hmsInput}
                  type="number"
                  min="0"
                  step="any"
                  inputMode="decimal"
                  value={purchaseToIssueFactor}
                  onChange={(e) => setPurchaseToIssueFactor(e.target.value)}
                  placeholder="e.g. 24"
                />
              </HmsField>
            ) : null}
            <HmsField id={`${uid}-type`} label="Item type">
              <Select value={itemTypeId} onValueChange={setItemTypeId}>
                <SelectTrigger id={`${uid}-type`} className={TRIGGER}>
                  <SelectValue />
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
            <HmsField id={`${uid}-cost`} label="Unit cost" optional>
              <input
                id={`${uid}-cost`}
                className={hmsInput}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="0.00"
              />
            </HmsField>
          </div>
        )}

        <DialogFooter>
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} onClick={() => void submit()} disabled={!canSubmit || submitting || loading}>
            {submitting ? "Creating…" : "Create item"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
