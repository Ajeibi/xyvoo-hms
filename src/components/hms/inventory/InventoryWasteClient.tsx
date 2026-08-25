"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { InventoryItemPicker } from "@/components/hms/inventory/InventoryItemPicker";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type {
  InventoryItemRow,
  InventoryLocationRow,
  InventoryMovementWithDetails,
} from "@/lib/hms/inventory-types";

const FOOD_REASON_PRESETS = ["Spoilage", "Expired", "Damaged in prep or service", "Other"];
const EQUIPMENT_REASON_PRESETS = ["Broken", "Worn out / end of life", "Lost", "Stained or torn beyond repair", "Other"];

export function InventoryWasteClient({
  slug,
  initialMovements,
  locations,
  items: initialItems,
  currency,
  canCreateItem = false,
}: {
  slug: string;
  initialMovements: InventoryMovementWithDetails[];
  locations: InventoryLocationRow[];
  items: InventoryItemRow[];
  currency: string;
  canCreateItem?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [qty, setQty] = useState("");
  const [reasonPreset, setReasonPreset] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedItem = items.find((it) => it.id === itemId);
  const reasonPresets = selectedItem?.item_type_is_equipment ? EQUIPMENT_REASON_PRESETS : FOOD_REASON_PRESETS;
  const reason = reasonPreset === "Other" ? customReason.trim() : reasonPreset;

  const canSubmit = Boolean(itemId) && Boolean(locationId) && Number(qty) > 0 && reason.length > 0 && !submitting;

  function resetForm() {
    setItemId("");
    setLocationId("");
    setQty("");
    setReasonPreset("");
    setCustomReason("");
    setNote("");
  }

  function selectItem(id: string) {
    setItemId(id);
    setReasonPreset("");
    setCustomReason("");
  }

  async function submitWaste() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/inventory/waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          itemId,
          locationId,
          qty: Number(qty),
          reason: reason.trim(),
          note: note.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not record waste", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Waste recorded");
      setOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          Record waste
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {initialMovements.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No waste entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Item</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Qty</th>
                  <th className="px-4 py-3 text-right">Cost</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {initialMovements.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-600">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{m.item_name}</p>
                      <p className="text-xs text-slate-500">{m.item_sku}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.location_name}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-900">
                      {Math.abs(m.qty)} {m.unit_of_measure}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {m.unit_cost_at_movement > 0
                        ? formatPricingAmount(Math.abs(m.qty) * m.unit_cost_at_movement, currency)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-500">{m.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Record waste</DialogTitle>
            <DialogDescription>Deducts stock immediately at the selected location.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Item</p>
              <InventoryItemPicker
                slug={slug}
                items={items}
                value={itemId}
                onValueChange={selectItem}
                canCreateItem={canCreateItem}
                onItemCreated={(item) => setItems((prev) => [...prev, item])}
                placeholder="Select item"
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Location</p>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Quantity</p>
              <Input
                type="number"
                min="0"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Reason</p>
              <Select value={reasonPreset} onValueChange={setReasonPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {reasonPresets.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {reasonPreset === "Other" ? (
                <Input
                  className="mt-2"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Describe the reason"
                />
              ) : null}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Note</p>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitWaste()} disabled={!canSubmit}>
              Record waste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
