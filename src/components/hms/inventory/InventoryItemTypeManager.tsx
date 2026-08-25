"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import type { InventoryItemTypeRow } from "@/lib/hms/inventory-types";

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
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-sm font-semibold text-slate-900">Item types</h2>
          <SettingsSectionInfo title="Item types" text={HELP_TEXT} />
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Classification used across the item catalog and reports — also controls stock-ledger behavior.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2 px-6 py-4">
        <div className="w-52">
          <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. New item type" />
        </div>
        <Button type="button" onClick={() => void add()} disabled={saving}>
          {saving ? "Adding…" : "Add item type"}
        </Button>
      </div>

      {rows.length === 0 ? (
        <p className="px-6 pb-6 text-sm text-slate-500">None yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 px-6 pb-2">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              {renamingId === row.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} className="w-56" autoFocus />
                  <Button type="button" size="sm" onClick={() => void saveRename(row.id)} disabled={busyId === row.id}>
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={cancelRename}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                    {row.is_fixed_asset ? (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Fixed asset — excluded from stock
                      </span>
                    ) : null}
                    {row.is_equipment ? (
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Equipment — breakage/loss
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => startRename(row.id, row.name)}>
                      Rename
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void toggleFixedAsset(row)}
                      disabled={busyId === row.id}
                    >
                      {row.is_fixed_asset ? "Unmark fixed asset" : "Mark fixed asset"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void toggleEquipment(row)}
                      disabled={busyId === row.id}
                    >
                      {row.is_equipment ? "Unmark equipment" : "Mark equipment"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void toggleActive(row)}
                      disabled={busyId === row.id}
                    >
                      {row.is_active ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => void remove(row)}
                      disabled={busyId === row.id}
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
  );
}
