"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Shapes, Trash2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type { InventoryItemTypeRow } from "@/lib/hms/inventory-types";

const SMALL_BUTTON = hmsButton.small;

const HELP_TEXT =
  "Fixed asset excludes an item type from stock entirely (ovens, fridges, furniture — track those on a separate asset register, not here). Equipment shows breakage/loss reasons (broken, worn out, lost) on Waste & spoilage instead of spoilage language — use it for durable goods like linen, cutlery, and crockery that don't get consumed, they wear out.";

/**
 * Item types manager — a fork of InventoryLookupManager with two extra
 * behavioral toggles that only item types need: Fixed asset (excluded from
 * the stock ledger entirely) and Equipment (breakage/loss language on Waste).
 */
export function InventoryItemTypeManager({ slug, rows }: { slug: string; rows: InventoryItemTypeRow[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const patch = async (id: string, body: Record<string, unknown>, successMessage: string, errorMessage: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/inventory/item-types/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(errorMessage, data.error ?? "Try again.");
        return;
      }
      toastSuccess(successMessage);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const add = async () => {
    if (!newName.trim()) {
      toastError("Item type name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/inventory/item-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: newName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add item type", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Item type added");
      setNewName("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const saveRename = async (id: string) => {
    if (!renameValue.trim()) {
      toastError("Item type name required");
      return;
    }
    await patch(id, { name: renameValue.trim() }, "Item type renamed", "Could not rename item type");
    cancelRename();
  };

  const toggleActive = (row: InventoryItemTypeRow) =>
    patch(
      row.id,
      { isActive: !row.is_active },
      row.is_active ? "Item type marked inactive" : "Item type marked active",
      "Could not update item type",
    );

  const toggleFixedAsset = (row: InventoryItemTypeRow) =>
    patch(
      row.id,
      { isFixedAsset: !row.is_fixed_asset },
      row.is_fixed_asset ? "No longer treated as a fixed asset" : "Now excluded from the stock ledger as a fixed asset",
      "Could not update item type",
    );

  const toggleEquipment = (row: InventoryItemTypeRow) =>
    patch(
      row.id,
      { isEquipment: !row.is_equipment },
      row.is_equipment ? "No longer treated as equipment" : "Now uses breakage/loss reasons on Waste & spoilage",
      "Could not update item type",
    );

  const remove = async (row: InventoryItemTypeRow) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/inventory/item-types/${row.id}?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not delete item type", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Item type deleted");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <HmsCard
      id="inventory-item-types"
      title="Item types"
      description="How items are classified across the catalogue and reports. Also controls how the stock ledger treats them."
      icon={Shapes}
      meaning="stock"
      flush
      actions={<SettingsSectionInfo title="Item types" text={HELP_TEXT} />}
    >
      <div className="flex flex-wrap items-end gap-3 px-5 py-4 sm:px-6">
        <div className="w-full sm:w-60">
          <HmsField id="inventory-item-type-new" label="Name">
            <input
              id="inventory-item-type-new"
              className={hmsInput}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. New item type"
            />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.primary} onClick={() => void add()} disabled={saving}>
          <Plus className="h-4 w-4" aria-hidden />
          {saving ? "Adding…" : "Add item type"}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-slate-100">
          <HmsEmptyState bare art="tag" meaning="stock" title="No item types yet" description="Add your first item type above." />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm sm:px-6">
              {renamingId === row.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <label htmlFor={`inventory-item-type-rename-${row.id}`} className="sr-only">
                    New name for {row.name}
                  </label>
                  <input
                    id={`inventory-item-type-rename-${row.id}`}
                    className={`${hmsInput} sm:w-64`}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    autoFocus
                  />
                  <button type="button" className={hmsButton.primary} onClick={() => void saveRename(row.id)} disabled={busyId === row.id}>
                    Save
                  </button>
                  <button type="button" className={hmsButton.secondary} onClick={cancelRename}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <HmsPill tone={row.is_active ? "green" : "slate"}>{row.is_active ? "Active" : "Inactive"}</HmsPill>
                    {row.is_fixed_asset ? <HmsPill tone="amber">Fixed asset: not in stock</HmsPill> : null}
                    {row.is_equipment ? <HmsPill tone="blue">Equipment: breakage and loss</HmsPill> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={SMALL_BUTTON} onClick={() => startRename(row.id, row.name)}>
                      Rename<span className="sr-only"> {row.name}</span>
                    </button>
                    <button type="button" className={SMALL_BUTTON} onClick={() => void toggleFixedAsset(row)} disabled={busyId === row.id}>
                      {row.is_fixed_asset ? "Unmark fixed asset" : "Mark fixed asset"}
                      <span className="sr-only"> for {row.name}</span>
                    </button>
                    <button type="button" className={SMALL_BUTTON} onClick={() => void toggleEquipment(row)} disabled={busyId === row.id}>
                      {row.is_equipment ? "Unmark equipment" : "Mark equipment"}
                      <span className="sr-only"> for {row.name}</span>
                    </button>
                    <button type="button" className={SMALL_BUTTON} onClick={() => void toggleActive(row)} disabled={busyId === row.id}>
                      {row.is_active ? "Deactivate" : "Activate"}
                      <span className="sr-only"> {row.name}</span>
                    </button>
                    <button type="button" className={hmsButton.danger} onClick={() => void remove(row)} disabled={busyId === row.id}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      Delete<span className="sr-only"> {row.name}</span>
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </HmsCard>
  );
}
