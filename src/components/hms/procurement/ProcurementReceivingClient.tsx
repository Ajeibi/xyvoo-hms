"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, PackageCheck, Truck } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
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
    <div className="space-y-6">
      <HmsCard
        id="procurement-awaiting-delivery"
        title="Awaiting delivery"
        description="Orders that have been sent to the vendor and not fully received."
        icon={Truck}
        meaning="stock"
        flush
      >
        {awaitingOrders.length === 0 ? (
          <HmsEmptyState bare art="truck" meaning="stock" title="No deliveries expected" description="No purchase orders are currently ordered and awaiting receipt." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {awaitingOrders.map((o) => {
              const overdue = o.expected_delivery_date ? new Date(o.expected_delivery_date) < new Date() : false;
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {o.po_number} · {o.vendor_name}
                    </p>
                    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      {o.expected_delivery_date ? `Expected ${formatDate(o.expected_delivery_date)}` : "No delivery date set"}
                      {overdue ? (
                        <HmsPill tone="red">
                          <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden /> Overdue
                        </HmsPill>
                      ) : null}
                    </p>
                  </div>
                  <button type="button" className={hmsButton.primary} onClick={() => setReceiveTarget(o)}>
                    Receive<span className="sr-only"> {o.po_number}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </HmsCard>

      <HmsCard id="procurement-receiving-notes" title="Recent receiving notes" icon={PackageCheck} meaning="stock" flush>
        {receipts.length === 0 ? (
          <HmsEmptyState bare art="box" meaning="stock" title="Nothing received yet" description="No goods have been received against a purchase order yet." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {receipts.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {r.receiptNumber} · {r.poNumber} · {r.vendorName}
                  </p>
                  <p className="text-sm text-slate-600">
                    {r.locationName} · {formatDate(r.createdAt)}
                  </p>
                </div>
                {r.hasDiscrepancy ? (
                  <HmsPill tone="red">
                    <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden /> Discrepancy
                  </HmsPill>
                ) : (
                  <HmsPill tone="green">No issues</HmsPill>
                )}
              </li>
            ))}
          </ul>
        )}
      </HmsCard>

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
        return {
          ...l,
          checkedChecklistItems,
          discrepancyType: !passed && l.discrepancyType === "none" ? "failed_inspection" : l.discrepancyType,
          // A failed line can't post to stock with zero rejected — default to rejecting the
          // whole received quantity; the receiver can still lower it for a partial accept.
          qtyRejected: !passed && Number(l.qtyRejected) <= 0 ? l.qtyReceived : l.qtyRejected,
        };
      }),
    );
  };

  const setManualQualityPassed = (id: string, passed: boolean) => {
    setLines((prev) =>
      prev.map((l) =>
        l.purchaseOrderLineId === id
          ? {
              ...l,
              manualQualityPassed: passed,
              qtyRejected: !passed && Number(l.qtyRejected) <= 0 ? l.qtyReceived : l.qtyRejected,
            }
          : l,
      ),
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
      toastSuccess(`Goods receipt ${data.receipt?.receiptNumber ?? ""} recorded`, data.billNote ?? undefined);
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
          <HmsField id="receive-location" label="Receiving store">
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="receive-location" className="h-11 rounded-xl border-slate-300">
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
          </HmsField>

          <div className="space-y-3">
            {lines.map((l) => {
              const lid = l.purchaseOrderLineId;
              const passed = lineQualityPassed(l);
              return (
                <fieldset key={lid} className="space-y-3 rounded-xl border border-slate-200 p-4">
                  <legend className="sr-only">{l.label}</legend>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium text-slate-900">
                      {l.label} <span className="font-normal text-slate-600">({l.remaining} {l.unitOfMeasure} outstanding)</span>
                    </p>
                    {passed ? <HmsPill tone="green">Quality passed</HmsPill> : <HmsPill tone="red">Quality failed</HmsPill>}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <HmsField id={`receive-qty-${lid}`} label="Received">
                      <input
                        id={`receive-qty-${lid}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        className={`${hmsInput} tabular-nums`}
                        value={l.qtyReceived}
                        onChange={(e) => updateLine(lid, { qtyReceived: e.target.value })}
                      />
                    </HmsField>
                    <HmsField id={`receive-rejected-${lid}`} label="Rejected">
                      <input
                        id={`receive-rejected-${lid}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        className={`${hmsInput} tabular-nums`}
                        value={l.qtyRejected}
                        onChange={(e) => updateLine(lid, { qtyRejected: e.target.value })}
                      />
                    </HmsField>
                    <HmsField id={`receive-cost-${lid}`} label="Unit cost">
                      <input
                        id={`receive-cost-${lid}`}
                        type="number"
                        min="0"
                        step="any"
                        inputMode="decimal"
                        className={`${hmsInput} tabular-nums`}
                        value={l.unitCost}
                        onChange={(e) => updateLine(lid, { unitCost: e.target.value })}
                      />
                    </HmsField>
                  </div>
                  <HmsField id={`receive-discrepancy-${lid}`} label="Discrepancy">
                    <Select value={l.discrepancyType} onValueChange={(v) => updateLine(lid, { discrepancyType: v as DiscrepancyType })}>
                      <SelectTrigger id={`receive-discrepancy-${lid}`} className="h-11 rounded-xl border-slate-300">
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
                  </HmsField>

                  {l.checklistItems.length > 0 ? (
                    <fieldset className="space-y-2 rounded-xl bg-teal-50 p-3">
                      <legend className="float-left mb-1 w-full text-sm font-medium text-slate-800">Quality inspection checklist</legend>
                      {l.checklistItems.map((item) => (
                        <label key={item} className="flex items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            className="h-5 w-5 rounded border-slate-300 text-teal-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                            checked={Boolean(l.checkedChecklistItems[item])}
                            onChange={() => toggleChecklistItem(lid, item)}
                          />
                          {item}
                        </label>
                      ))}
                    </fieldset>
                  ) : (
                    <label className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        className="h-5 w-5 rounded border-slate-300 text-teal-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                        checked={l.manualQualityPassed}
                        onChange={(e) => setManualQualityPassed(lid, e.target.checked)}
                      />
                      Passed quality inspection (no checklist set up for this item type)
                    </label>
                  )}

                  {l.discrepancyType !== "none" || !passed ? (
                    <HmsField id={`receive-notes-${lid}`} label="Notes for follow-up with the vendor">
                      <input
                        id={`receive-notes-${lid}`}
                        className={hmsInput}
                        value={l.qualityNotes}
                        onChange={(e) => updateLine(lid, { qualityNotes: e.target.value })}
                      />
                    </HmsField>
                  ) : null}
                </fieldset>
              );
            })}
          </div>

          <HmsField id="receive-notes" label="Notes" optional>
            <input id="receive-notes" className={hmsInput} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </HmsField>
        </div>

        <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} disabled={!locationId || submitting} onClick={() => void submit()}>
            {submitting ? "Recording…" : "Record receipt"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
