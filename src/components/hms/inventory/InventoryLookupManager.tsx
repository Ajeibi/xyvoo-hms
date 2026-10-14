"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Plus, Trash2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const SMALL_BUTTON = hmsButton.small;

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

  const idBase = `inventory-lookup-${apiPath.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <HmsCard
      id={idBase}
      title={title}
      description={description}
      icon={ListChecks}
      meaning="stock"
      flush
      actions={helpText ? <SettingsSectionInfo title={title} text={helpText} /> : undefined}
    >
      <div className="flex flex-wrap items-end gap-3 px-5 py-4 sm:px-6">
        <div className="w-full sm:w-60">
          <HmsField id={`${idBase}-new`} label="Name">
            <input
              id={`${idBase}-new`}
              className={hmsInput}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`e.g. New ${singularLabel.toLowerCase()}`}
            />
          </HmsField>
        </div>
        <button type="button" className={hmsButton.primary} onClick={() => void add()} disabled={saving}>
          <Plus className="h-4 w-4" aria-hidden />
          {saving ? "Adding…" : `Add ${singularLabel.toLowerCase()}`}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="border-t border-slate-100">
          <HmsEmptyState bare art="tag" meaning="stock" title="Nothing here yet" description={`Add your first ${singularLabel.toLowerCase()} above.`} />
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm sm:px-6">
              {renamingId === row.id ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <label htmlFor={`${idBase}-rename-${row.id}`} className="sr-only">
                    New name for {row.name}
                  </label>
                  <input
                    id={`${idBase}-rename-${row.id}`}
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
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{row.name}</span>
                    <HmsPill tone={row.is_active ? "green" : "slate"}>{row.is_active ? "Active" : "Inactive"}</HmsPill>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={SMALL_BUTTON} onClick={() => startRename(row.id, row.name)}>
                      Rename<span className="sr-only"> {row.name}</span>
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
