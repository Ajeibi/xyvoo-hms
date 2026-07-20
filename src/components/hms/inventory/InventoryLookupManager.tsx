"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";

export type InventoryLookupRow = {
  id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

/**
 * Generic add / rename / activate-toggle / delete manager for a tenant-owned
 * inventory lookup list (units, item types, store location types). Each of
 * those is a real table now — this is the shared CRUD surface for all three,
 * mirroring the Categories manager on the Item catalog page.
 */
export function InventoryLookupManager({
  slug,
  title,
  description,
  apiPath,
  singularLabel,
  rows,
  helpText,
}: {
  slug: string;
  title: string;
  description: string;
  apiPath: string;
  singularLabel: string;
  rows: InventoryLookupRow[];
  helpText?: string;
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async () => {
    if (!newName.trim()) {
      toastError(`${singularLabel} name required`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/hotel/inventory/${apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: newName.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`Could not add ${singularLabel.toLowerCase()}`, data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${singularLabel} added`);
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
      toastError(`${singularLabel} name required`);
      return;
    }
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/inventory/${apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: renameValue.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`Could not rename ${singularLabel.toLowerCase()}`, data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${singularLabel} renamed`);
      cancelRename();
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (row: InventoryLookupRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/inventory/${apiPath}/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, isActive: !row.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`Could not update ${singularLabel.toLowerCase()}`, data.error ?? "Try again.");
        return;
      }
      toastSuccess(row.is_active ? `${singularLabel} marked inactive` : `${singularLabel} marked active`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (row: InventoryLookupRow) => {
    if (!window.confirm(`Delete "${row.name}"? This cannot be undone.`)) return;
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/hotel/inventory/${apiPath}/${row.id}?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError(`Could not delete ${singularLabel.toLowerCase()}`, data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${singularLabel} deleted`);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {helpText ? <SettingsSectionInfo title={title} text={helpText} /> : null}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{description}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2 px-6 py-4">
        <div className="w-52">
          <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`e.g. New ${singularLabel.toLowerCase()}`} />
        </div>
        <Button type="button" onClick={() => void add()} disabled={saving}>
          {saving ? "Adding…" : `Add ${singularLabel.toLowerCase()}`}
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
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {row.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => startRename(row.id, row.name)}>
                      Rename
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
