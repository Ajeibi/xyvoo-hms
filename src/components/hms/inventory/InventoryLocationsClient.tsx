"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import type { InventoryLocationRow, InventoryLocationTypeRow } from "@/lib/hms/inventory-types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function InventoryLocationsClient({
  slug,
  locations,
  locationTypes,
}: {
  slug: string;
  locations: InventoryLocationRow[];
  locationTypes: InventoryLocationTypeRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [locationTypeId, setLocationTypeId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setLocationTypeId("");
  };

  const canSubmit = name.trim().length > 0 && locationTypeId.length > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/inventory/locations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, name: name.trim(), locationTypeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create store", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${data.location?.name ?? "Store"} created`);
      setOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (location: InventoryLocationRow) => {
    setTogglingId(location.id);
    try {
      const res = await fetch(`/api/hotel/inventory/locations/${location.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, isActive: !location.is_active }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update store", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${location.name} ${location.is_active ? "deactivated" : "activated"}`);
      router.refresh();
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-end">
        <Button type="button" className="rounded-lg" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" />
          New store
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-semibold text-slate-900">Stores</h2>
            <SettingsSectionInfo
              title="Stores"
              text="The physical or logical stock locations you hold inventory in (Main Store, Kitchen Store, Housekeeping Store, etc.). Structural setup — create these once when onboarding a property; day-to-day stock counts and issues happen on the Inventory page, not here."
            />
          </div>
        </div>
        {locations.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            No store locations yet. Create your first store to start tracking stock.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {locations.map((location) => (
              <li key={location.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 text-sm">
                <div>
                  <p className="font-semibold text-slate-900">{location.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Created {formatDate(location.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                    {location.location_type_name}
                  </span>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      location.is_active
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {location.is_active ? "Active" : "Inactive"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-lg"
                    disabled={togglingId === location.id}
                    onClick={() => void toggleActive(location)}
                  >
                    {location.is_active ? "Deactivate" : "Activate"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New store</DialogTitle>
            <DialogDescription>Add a store location to hold and issue inventory from.</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Store name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Main Store" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Store type</label>
              <Select value={locationTypeId} onValueChange={setLocationTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder={locationTypes.length ? "Select a type" : "Add a type in Settings first"} />
                </SelectTrigger>
                <SelectContent>
                  {locationTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()}>
              {submitting ? "Creating…" : "Create store"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
