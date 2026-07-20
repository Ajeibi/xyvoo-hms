"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { InventoryLocationRow } from "@/lib/hms/inventory-types";
import type { DiscrepancyType, PurchaseOrderWithLines } from "@/lib/hms/procurement-types";
import type { ProcurementReceipt } from "@/lib/hms/procurement-receiving";

const DISCREPANCY_OPTIONS: { value: DiscrepancyType; label: string }[] = [
  { value: "none", label: "No discrepancy" },
  { value: "short_delivered", label: "Short delivered" },
  { value: "damaged", label: "Damaged" },
  { value: "wrong_item", label: "Wrong item" },
  { value: "failed_inspection", label: "Failed quality inspection" },
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function ProcurementReceivingClient({
  slug,
  awaitingOrders,
  receipts,
  locations,
  checklistByItemId,
  preselectedOrder,
}: {
  slug: string;
  awaitingOrders: PurchaseOrderWithLines[];
  receipts: ProcurementReceipt[];
  locations: InventoryLocationRow[];
  checklistByItemId: Record<string, string[]>;
  preselectedOrder: PurchaseOrderWithLines | null;
}) {
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrderWithLines | null>(preselectedOrder);

  return (
    <div className="mt-6 space-y-6">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Awaiting delivery</h2>
        </div>
        {awaitingOrders.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No purchase orders are currently ordered and awaiting receipt.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {awaitingOrders.map((o) => {
              const overdue = o.expected_delivery_date ? new Date(o.expected_delivery_date) < new Date() : false;
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      {o.po_number} · {o.vendor_name}
                    </p>
                    <p className={`text-xs ${overdue ? "text-red-600" : "text-slate-400"}`}>
                      {o.expected_delivery_date ? `Expected ${formatDate(o.expected_delivery_date)}` : "No delivery date set"}
                      {overdue ? " · overdue" : ""}
                    </p>
                  </div>
                  <Button type="button" size="sm" className="rounded-lg" onClick={() => setReceiveTarget(o)}>
                    Receive
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent receiving notes</h2>
        </div>
        {receipts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No goods have been received against a purchase order yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    {r.receiptNumber} · {r.poNumber} · {r.vendorName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {r.locationName} · {formatDate(r.createdAt)}
                  </p>
                </div>
                {r.hasDiscrepancy ? (
                  <span className="flex shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">
                    <AlertTriangle className="h-3 w-3" /> Discrepancy
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Clean</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ReceiveDialog
        key={receiveTarget?.id ?? "none"}
        slug={slug}
        order={receiveTarget}
        locations={locations}
        checklistByItemId={checklistByItemId}
        onOpenChange={(open) => {
          if (!open) setReceiveTarget(null);
        }}
      />
    </div>
  );
}

type DraftLine = {
  purchaseOrderLineId: string;
  itemId: string;
  label: string;
  remaining: number;
  unitOfMeasure: string;
  qtyReceived: string;
  qtyRejected: string;
  unitCost: string;
  discrepancyType: DiscrepancyType;
  checklistItems: string[];
  checkedChecklistItems: Record<string, boolean>;
  manualQualityPassed: boolean;
  qualityNotes: string;
};

function lineQualityPassed(l: DraftLine) {
  return l.checklistItems.length > 0 ? l.checklistItems.every((item) => l.checkedChecklistItems[item]) : l.manualQualityPassed;
}

function ReceiveDialog({
  slug,
  order,
  locations,
  checklistByItemId,
  onOpenChange,
}: {
  slug: string;
  order: PurchaseOrderWithLines | null;
  locations: InventoryLocationRow[];
  checklistByItemId: Record<string, string[]>;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const open = Boolean(order);

  const initialLines = useMemo<DraftLine[]>(() => {
    if (!order) return [];
    return order.lines
      .filter((l) => l.item_id && l.quantity_received < l.quantity)
      .map((l) => ({
        purchaseOrderLineId: l.id,
        itemId: l.item_id as string,
        label: `${l.item_name ?? l.description} (${l.item_sku ?? ""})`,
        remaining: l.quantity - l.quantity_received,
        unitOfMeasure: l.unit_of_measure ?? "",
        qtyReceived: String(l.quantity - l.quantity_received),
        qtyRejected: "0",
        unitCost: String(l.unit_cost),
        discrepancyType: "none" as DiscrepancyType,
        checklistItems: checklistByItemId[l.item_id as string] ?? [],
        checkedChecklistItems: {},
        manualQualityPassed: true,
        qualityNotes: "",
      }));
  }, [order, checklistByItemId]);

  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>(initialLines);
  const [submitting, setSubmitting] = useState(false);

  const updateLine = (id: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.purchaseOrderLineId === id ? { ...l, ...patch } : l)));
  };

  const toggleChecklistItem = (id: string, item: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.purchaseOrderLineId !== id) return l;
        const checkedChecklistItems = { ...l.checkedChecklistItems, [item]: !l.checkedChecklistItems[item] };
        const passed = l.checklistItems.every((i) => checkedChecklistItems[i]);
        return { ...l, checkedChecklistItems, discrepancyType: !passed && l.discrepancyType === "none" ? "failed_inspection" : l.discrepancyType };
      }),
    );
  };

  const submit = async () => {
    if (!order) return;
    setSubmitting(true);
    try {
      const payloadLines = lines
        .filter((l) => Number(l.qtyReceived) > 0 || Number(l.qtyRejected) > 0)
        .map((l) => ({
          purchaseOrderLineId: l.purchaseOrderLineId,
          itemId: l.itemId,
          qtyReceived: Number(l.qtyReceived) || 0,
          qtyRejected: Number(l.qtyRejected) || 0,
          unitCost: Number(l.unitCost) || 0,
          discrepancyType: l.discrepancyType,
          qualityPassed: lineQualityPassed(l),
          qualityNotes: l.qualityNotes || undefined,
        }));

      if (!payloadLines.length) {
        toastError("Nothing to receive", "Enter a received or rejected quantity for at least one item.");
        return;
      }

      const res = await fetch("/api/hotel/procurement/receiving", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, poId: order.id, locationId, notes: notes.trim() || undefined, lines: payloadLines }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not record receiving note", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Goods receipt ${data.receipt?.receiptNumber ?? ""} recorded`);
      onOpenChange(false);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(92vh,calc(100vh-2rem))] max-w-2xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5 pr-12">
          <DialogTitle>Receive goods — {order?.po_number}</DialogTitle>
          <DialogDescription>Record what actually arrived and run the quality check before it&apos;s accepted into stock.</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Receiving store</label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a store" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            {lines.map((l) => (
              <div key={l.purchaseOrderLineId} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-800">
                  {l.label} <span className="text-xs text-slate-400">({l.remaining} {l.unitOfMeasure} outstanding)</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Received</label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={l.qtyReceived}
                      onChange={(e) => updateLine(l.purchaseOrderLineId, { qtyReceived: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Rejected</label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={l.qtyRejected}
                      onChange={(e) => updateLine(l.purchaseOrderLineId, { qtyRejected: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">Unit cost</label>
                    <Input
                      type="number"
                      min="0"
                      step="any"
                      value={l.unitCost}
                      onChange={(e) => updateLine(l.purchaseOrderLineId, { unitCost: e.target.value })}
                    />
                  </div>
                </div>
                <Select
                  value={l.discrepancyType}
                  onValueChange={(v) => updateLine(l.purchaseOrderLineId, { discrepancyType: v as DiscrepancyType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCREPANCY_OPTIONS.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {l.checklistItems.length > 0 ? (
                  <div className="space-y-1 rounded-md bg-slate-50 p-2">
                    <p className="text-xs font-medium text-slate-500">Quality inspection checklist</p>
                    {l.checklistItems.map((item) => (
                      <label key={item} className="flex items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300"
                          checked={Boolean(l.checkedChecklistItems[item])}
                          onChange={() => toggleChecklistItem(l.purchaseOrderLineId, item)}
                        />
                        {item}
                      </label>
                    ))}
                  </div>
                ) : (
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={l.manualQualityPassed}
                      onChange={(e) => updateLine(l.purchaseOrderLineId, { manualQualityPassed: e.target.checked })}
                    />
                    Passed quality inspection (no checklist configured for this item type)
                  </label>
                )}

                {l.discrepancyType !== "none" || !lineQualityPassed(l) ? (
                  <Input
                    value={l.qualityNotes}
                    onChange={(e) => updateLine(l.purchaseOrderLineId, { qualityNotes: e.target.value })}
                    placeholder="Notes for follow-up with the vendor"
                  />
                ) : null}
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={!locationId || submitting} onClick={() => void submit()}>
            {submitting ? "Recording…" : "Record receipt"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
