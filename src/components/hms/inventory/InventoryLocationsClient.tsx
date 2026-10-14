"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Warehouse } from "lucide-react";
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
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
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
    <div className="space-y-4">
      <HmsCard
        id="inventory-stores"
        title="Stores"
        description="The places you hold stock in, such as a main store or kitchen store."
        icon={Warehouse}
        meaning="stock"
        flush
        actions={
          <>
            <SettingsSectionInfo
              title="Stores"
              text="The physical or logical stock locations you hold inventory in (Main Store, Kitchen Store, Housekeeping Store, etc.). Structural setup — create these once when onboarding a property; day-to-day stock counts and issues happen on the Inventory page, not here."
            />
            <button type="button" className={hmsButton.primary} onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden />
              New store
            </button>
          </>
        }
      >
        {locations.length === 0 ? (
          <HmsEmptyState
            bare
            art="box"
            meaning="stock"
            title="No stores yet"
            description="Create your first store to start tracking stock."
            action={
              <button type="button" className={hmsButton.primary} onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                New store
              </button>
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {locations.map((location) => (
              <li key={location.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm sm:px-6">
                <div>
                  <p className="font-semibold text-slate-900">{location.name}</p>
                  <p className="mt-0.5 text-sm text-slate-600">Created {formatDate(location.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <HmsPill tone="blue">{location.location_type_name}</HmsPill>
                  <HmsPill tone={location.is_active ? "green" : "slate"}>{location.is_active ? "Active" : "Inactive"}</HmsPill>
                  <button
                    type="button"
                    className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={togglingId === location.id}
                    onClick={() => void toggleActive(location)}
                  >
                    {location.is_active ? "Deactivate" : "Activate"}
                    <span className="sr-only"> {location.name}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>

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

          <div className="space-y-4">
            <HmsField id="inventory-store-name" label="Store name">
              <input
                id="inventory-store-name"
                className={hmsInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main Store"
              />
            </HmsField>
            <HmsField id="inventory-store-type" label="Store type">
              <Select value={locationTypeId} onValueChange={setLocationTypeId}>
                <SelectTrigger id="inventory-store-type" className="h-[42px] rounded-xl border-slate-300">
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
            </HmsField>
          </div>

          <DialogFooter>
            <button type="button" className={hmsButton.secondary} onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </button>
            <button type="button" className={hmsButton.primary} disabled={!canSubmit || submitting} onClick={() => void submit()}>
              {submitting ? "Creating…" : "Create store"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
