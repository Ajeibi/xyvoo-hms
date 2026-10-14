"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConciergeBell } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
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
    <HmsCard
      id="guest-service-categories"
      title="Guest service categories"
      description="What staff pick from when logging a guest request, and which department each one goes to."
      icon={ConciergeBell}
      meaning="guests"
      actions={
        <SettingsSectionInfo
          title="Guest service categories"
          text="The categories staff choose from when logging a guest request (e.g. Housekeeping, Laundry, Spa) and which department each one notifies and routes to. Set up once; only revisit when adding a new type of request or changing which department handles one."
        />
      }
    >
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {rows.length === 0 ? (
          <HmsEmptyState
            bare
            icon={ConciergeBell}
            meaning="guests"
            title="No categories yet"
            description="Add your first one below, for example Extra towels going to Housekeeping."
          />
        ) : (
          rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              {renamingId === row.id ? (
                <Input
                  autoFocus
                  aria-label={`New name for ${row.name}`}
                  className="h-9 max-w-[220px]"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void patch(row.id, { name: renameValue }, "Category renamed.").then(() => setRenamingId(null));
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
              ) : (
                <span className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={`rounded-md text-left font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${row.isActive ? "text-slate-900" : "text-slate-600 line-through"}`}
                    onClick={() => {
                      setRenamingId(row.id);
                      setRenameValue(row.name);
                    }}
                    title="Click to rename"
                  >
                    {row.name}
                    <span className="sr-only"> (select to rename)</span>
                  </button>
                  {!row.isActive ? <HmsPill>Inactive</HmsPill> : null}
                </span>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Department for ${row.name}`}
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="h-9 text-sm"
                  disabled={busyId === row.id}
                  onClick={() => void patch(row.id, { isActive: !row.isActive }, row.isActive ? "Category deactivated." : "Category reactivated.")}
                >
                  {row.isActive ? "Deactivate" : "Activate"}
                  <span className="sr-only"> {row.name}</span>
                </Button>
                <button
                  type="button"
                  className={hmsButton.danger}
                  disabled={busyId === row.id}
                  onClick={() => void remove(row.id)}
                >
                  Delete
                  <span className="sr-only"> {row.name}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_200px_auto] sm:items-end">
        <HmsField id="guest-service-new-name" label="New category">
          <input
            id="guest-service-new-name"
            className={hmsInput}
            placeholder="For example, Laundry"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
        </HmsField>
        <HmsField id="guest-service-new-department" label="Goes to">
          <select
            id="guest-service-new-department"
            className={hmsInput}
            value={newDepartment}
            onChange={(e) => setNewDepartment(e.target.value)}
          >
            {DEPARTMENT_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </HmsField>
        <button type="button" disabled={saving} onClick={() => void add()} className={hmsButton.primary}>
          Add category
        </button>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Currently mapped: {rows.filter((r) => r.isActive).map((r) => `${r.name} → ${departmentLabel(r.department)}`).join(", ") || "none"}
      </p>
    </HmsCard>
  );
}
