"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import type { GuestServiceCategoryRow } from "@/lib/hms/guest-service-categories";

const DEPARTMENT_OPTIONS = [
  { value: "front_desk", label: "Front desk" },
  { value: "housekeeping", label: "Housekeeping" },
  { value: "maintenance", label: "Maintenance" },
  { value: "food_beverage", label: "Food & beverage" },
  { value: "concierge", label: "Concierge" },
  { value: "laundry", label: "Laundry" },
  { value: "security", label: "Security" },
] as const;

function departmentLabel(value: string) {
  return DEPARTMENT_OPTIONS.find((d) => d.value === value)?.label ?? value.replace(/_/g, " ");
}

export function GuestServiceCategoriesManager({
  slug,
  rows,
}: {
  slug: string;
  rows: GuestServiceCategoryRow[];
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newDepartment, setNewDepartment] = useState<string>(DEPARTMENT_OPTIONS[0].value);
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const add = async () => {
    if (!newName.trim()) {
      toastError("Category name required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/guest-services/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: newName.trim(), department: newDepartment }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add category", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Category added.");
      setNewName("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const patch = async (id: string, body: Record<string, unknown>, successMessage: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/frontdesk/guest-services/categories/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update category", data.error ?? "Try again.");
        return;
      }
      toastSuccess(successMessage);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/frontdesk/guest-services/categories/${id}?slug=${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not remove category", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Category removed.");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        <h2 className="text-sm font-semibold text-slate-800">Guest service categories</h2>
        <SettingsSectionInfo
          title="Guest service categories"
          text="The categories staff choose from when logging a guest request (e.g. Housekeeping, Laundry, Spa) and which department each one notifies and routes to. Set up once; only revisit when adding a new type of request or changing which department handles one."
        />
      </div>
      <p className="mt-1 text-sm text-slate-500">
        The categories staff pick from when logging a guest service request, and which department
        each one routes and notifies.
      </p>

      <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
        {rows.length === 0 ? (
          <p className="p-3 text-sm text-slate-500">No categories configured yet.</p>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
              {renamingId === row.id ? (
                <Input
                  autoFocus
                  className="h-8 max-w-[220px]"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void patch(row.id, { name: renameValue }, "Category renamed.").then(() => setRenamingId(null));
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={`text-left font-medium ${row.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}
                  onClick={() => {
                    setRenamingId(row.id);
                    setRenameValue(row.name);
                  }}
                  title="Click to rename"
                >
                  {row.name}
                </button>
              )}

              <div className="flex items-center gap-2">
                <select
                  className="h-8 rounded-md border border-slate-200 px-2 text-xs"
                  value={row.department}
                  disabled={busyId === row.id}
                  onChange={(e) => void patch(row.id, { department: e.target.value }, "Department updated.")}
                >
                  {DEPARTMENT_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={busyId === row.id}
                  onClick={() => void patch(row.id, { isActive: !row.isActive }, row.isActive ? "Category deactivated." : "Category reactivated.")}
                >
                  {row.isActive ? "Deactivate" : "Activate"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-red-700 hover:bg-red-50"
                  disabled={busyId === row.id}
                  onClick={() => void remove(row.id)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 grid grid-cols-[1fr_180px_auto] gap-2">
        <Input placeholder="New category name" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <select
          className="h-10 rounded-lg border border-slate-200 px-3 text-sm"
          value={newDepartment}
          onChange={(e) => setNewDepartment(e.target.value)}
        >
          {DEPARTMENT_OPTIONS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <Button type="button" disabled={saving} onClick={() => void add()} className="rounded-lg">
          Add
        </Button>
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Currently mapped: {rows.filter((r) => r.isActive).map((r) => `${r.name} → ${departmentLabel(r.department)}`).join(", ") || "none"}
      </p>
    </section>
  );
}
