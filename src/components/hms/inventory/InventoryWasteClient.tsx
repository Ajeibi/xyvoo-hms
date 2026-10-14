"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { HmsCard, HmsEmptyState, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type {
  InventoryItemRow,
  InventoryLocationRow,
  InventoryMovementWithDetails,
} from "@/lib/hms/inventory-types";

const FOOD_REASON_PRESETS = ["Spoilage", "Expired", "Damaged in prep or service", "Other"];
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
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

  const recordButton = (
    <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      Record waste
    </button>
  );

  return (
    <div className="space-y-6">
      <HmsCard
        id="inventory-waste-list"
        title="Waste log"
        description="Stock written off, newest first, with the reason given."
        icon={Trash2}
        meaning="attention"
        flush
        actions={recordButton}
      >
        {initialMovements.length === 0 ? (
          <HmsEmptyState
            bare
            art="box"
            meaning="attention"
            title="No waste recorded"
            description="When stock is spoiled, broken or past its date, record it here so your stock stays accurate."
            action={recordButton}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-100 text-sm font-medium text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Date</th>
                  <th scope="col" className="px-4 py-3">Item</th>
                  <th scope="col" className="px-4 py-3">Location</th>
                  <th scope="col" className="px-4 py-3 text-right">Qty</th>
                  <th scope="col" className="px-4 py-3 text-right">Cost</th>
                  <th scope="col" className="px-4 py-3">Reason</th>
                  <th scope="col" className="px-4 py-3">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {initialMovements.map((m) => (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{m.item_name}</p>
                      <p className="text-xs text-slate-600">{m.item_sku}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.location_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
                      {Math.abs(m.qty)} {m.unit_of_measure}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-slate-900">
                      {m.unit_cost_at_movement > 0
                        ? formatPricingAmount(Math.abs(m.qty) * m.unit_cost_at_movement, currency)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{m.note ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

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
            <DialogDescription>The stock is taken off at the chosen location straight away.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="mb-1 block text-sm font-medium text-slate-800">Item</p>
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
            <HmsField id="inventory-waste-location" label="Location">
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="inventory-waste-location" className="rounded-xl border-slate-300">
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
            </HmsField>
            <HmsField id="inventory-waste-qty" label="Quantity">
              <input
                id="inventory-waste-qty"
                type="number"
                min="0"
                step="any"
                className={hmsInput}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </HmsField>
            <div>
              <HmsField id="inventory-waste-reason" label="Reason">
                <Select value={reasonPreset} onValueChange={setReasonPreset}>
                  <SelectTrigger id="inventory-waste-reason" className="rounded-xl border-slate-300">
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
              </HmsField>
              {reasonPreset === "Other" ? (
                <input
                  aria-label="Describe the reason"
                  className={`${hmsInput} mt-2`}
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Describe the reason"
                />
              ) : null}
            </div>
            <HmsField id="inventory-waste-note" label="Note" optional>
              <input id="inventory-waste-note" className={hmsInput} value={note} onChange={(e) => setNote(e.target.value)} />
            </HmsField>
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
