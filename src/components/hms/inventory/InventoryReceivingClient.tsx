"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
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
import type { InventoryReceiptWithLines } from "@/lib/hms/inventory-types";
import type { InventoryItemRow, InventoryLocationRow, InventorySupplierRow } from "@/lib/hms/inventory-types";

const OTHER_SUPPLIER = "__other__";

type DraftLine = {
  key: string;
  itemId: string;
  qtyReceived: string;
  unitCost: string;
  /** Which unit qtyReceived/unitCost are entered in — only meaningful when the item has a distinct purchase unit. */
  unitMode: "issue" | "purchase";
};

function emptyLine(): DraftLine {
  return { key: crypto.randomUUID(), itemId: "", qtyReceived: "1", unitCost: "0", unitMode: "issue" };
}

function formatNumber(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function receiptTotal(receipt: InventoryReceiptWithLines) {
  return receipt.lines.reduce((sum, l) => sum + l.qty_received * l.unit_cost, 0);
}

export function InventoryReceivingClient({
  slug,
  receipts,
  locations,
  items: initialItems,
  suppliers = [],
  canCreateItem = false,
}: {
  slug: string;
  receipts: InventoryReceiptWithLines[];
  locations: InventoryLocationRow[];
  items: InventoryItemRow[];
  suppliers?: InventorySupplierRow[];
  canCreateItem?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const activeSuppliers = useMemo(() => suppliers.filter((s) => s.is_active), [suppliers]);
  const [procurementReference, setProcurementReference] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState("");

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const filteredReceipts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return receipts;
    return receipts.filter(
      (r) =>
        r.receipt_number.toLowerCase().includes(term) ||
        (r.supplier_name ?? "").toLowerCase().includes(term) ||
        r.lines.some((l) => l.item_name.toLowerCase().includes(term) || l.item_sku.toLowerCase().includes(term)),
    );
  }, [receipts, search]);

  const resetForm = () => {
    setLocationId("");
    setSupplierId("");
    setSupplierName("");
    setProcurementReference("");
    setNotes("");
    setLines([emptyLine()]);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const setLineItem = (key: string, itemId: string) => {
    const item = itemById.get(itemId);
    updateLine(key, { itemId, unitCost: item ? String(item.unit_cost) : "0", unitMode: "issue" });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (key: string) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));

  const canSubmit =
    locationId.trim().length > 0 &&
    lines.some((l) => l.itemId && Number(l.qtyReceived) > 0);

  const submit = async () => {
    setSubmitting(true);
    try {
      const payloadLines = lines
        .filter((l) => l.itemId && Number(l.qtyReceived) > 0)
        .map((l) => {
          const item = itemById.get(l.itemId);
          const factor = l.unitMode === "purchase" ? item?.purchase_to_issue_factor || 1 : 1;
          // Convert from the entered unit (purchase unit, e.g. a case) into the
          // issue unit the ledger always tracks in (e.g. pieces).
          return {
            itemId: l.itemId,
            qtyReceived: Number(l.qtyReceived) * factor,
            unitCost: (Number(l.unitCost) || 0) / factor,
          };
        });

      const res = await fetch("/api/hotel/inventory/receipts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          locationId,
          supplierId: supplierId && supplierId !== OTHER_SUPPLIER ? supplierId : undefined,
          supplierName: supplierName.trim() || undefined,
          procurementReference: procurementReference.trim() || undefined,
          notes: notes.trim() || undefined,
          lines: payloadLines,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not post receipt", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Receipt ${data.receipt?.receipt_number ?? ""} posted`, "Stock has been added to the store.");
      setOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by receipt #, supplier, item, or SKU"
          className="w-full flex-1 sm:max-w-sm"
        />
        <Button
          type="button"
          className="rounded-lg"
          onClick={() => setOpen(true)}
          disabled={locations.length === 0 || items.length === 0}
        >
          <Plus className="h-4 w-4" />
          Receive stock
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Recent receipts</h2>
        </div>
        {filteredReceipts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            {receipts.length === 0 ? "No goods receipts recorded yet." : "No receipts match your search."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredReceipts.map((r) => (
              <li key={r.id} className="px-6 py-4 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{r.receipt_number}</p>
                    <p className="mt-0.5 text-slate-600">
                      {r.location_name}
                      {r.supplier_name ? ` · ${r.supplier_name}` : ""}
                      {r.procurement_reference ? ` · Ref ${r.procurement_reference}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-slate-900">{formatNumber(receiptTotal(r))}</p>
                    <p className="text-xs text-slate-500">
                      {r.lines.length} line{r.lines.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-500">{formatDate(r.created_at)}</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {r.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-2">
                      <span className="min-w-0 truncate">
                        {l.item_name} ({l.item_sku})
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {l.qty_received} {l.unit_of_measure} @ {formatNumber(l.unit_cost)}
                      </span>
                    </li>
                  ))}
                </ul>
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
        <DialogContent className="flex max-h-[min(90vh,calc(100vh-2rem))] max-w-2xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-slate-100 px-6 py-5 pr-12">
            <DialogTitle>Receive stock</DialogTitle>
            <DialogDescription>Post a goods receipt into a store location.</DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Store location</label>
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
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Supplier (optional)</label>
                <Select
                  value={supplierId}
                  onValueChange={(v) => {
                    setSupplierId(v);
                    if (v !== OTHER_SUPPLIER) setSupplierName("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    {activeSuppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                    <SelectItem value={OTHER_SUPPLIER}>Other (type below)</SelectItem>
                  </SelectContent>
                </Select>
                {supplierId === OTHER_SUPPLIER ? (
                  <Input
                    className="mt-2"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    placeholder="Supplier name"
                  />
                ) : null}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Procurement reference (optional)</label>
                <Input
                  value={procurementReference}
                  onChange={(e) => setProcurementReference(e.target.value)}
                  placeholder="PO number"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Notes (optional)</label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-600">Items received</label>
                <Button type="button" variant="outline" size="sm" className="rounded-lg" onClick={addLine}>
                  <Plus className="h-3.5 w-3.5" />
                  Add line
                </Button>
              </div>

              <div className="space-y-2">
                {lines.map((line) => {
                  const item = itemById.get(line.itemId);
                  return (
                    <div
                      key={line.key}
                      className="grid grid-cols-12 items-center gap-2 rounded-lg border border-slate-200 p-2"
                    >
                      <div className="col-span-5">
                        <InventoryItemPicker
                          slug={slug}
                          items={items}
                          value={line.itemId}
                          onValueChange={(v) => setLineItem(line.key, v)}
                          canCreateItem={canCreateItem}
                          onItemCreated={(created) => setItems((prev) => [...prev, created])}
                          placeholder="Select item"
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={line.qtyReceived}
                          onChange={(e) => updateLine(line.key, { qtyReceived: e.target.value })}
                          placeholder="Qty"
                        />
                      </div>
                      <div className="col-span-3">
                        <Input
                          type="number"
                          min="0"
                          step="any"
                          value={line.unitCost}
                          onChange={(e) => updateLine(line.key, { unitCost: e.target.value })}
                          placeholder="Unit cost"
                        />
                      </div>
                      <div className="col-span-1 flex justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => removeLine(line.key)}
                          disabled={lines.length === 1}
                        >
                          <Trash2 className="h-4 w-4 text-slate-400" />
                        </Button>
                      </div>
                      {item?.purchase_unit_id ? (
                        <div className="col-span-12 -mt-1 flex items-center gap-2 text-xs text-slate-400">
                          <span>Entering qty/cost per:</span>
                          <div className="flex overflow-hidden rounded-md border border-slate-200">
                            <button
                              type="button"
                              className={`px-2 py-0.5 ${line.unitMode === "issue" ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}
                              onClick={() => updateLine(line.key, { unitMode: "issue" })}
                            >
                              {item.unit_of_measure_name}
                            </button>
                            <button
                              type="button"
                              className={`px-2 py-0.5 ${line.unitMode === "purchase" ? "bg-blue-50 text-blue-700" : "text-slate-500"}`}
                              onClick={() => updateLine(line.key, { unitMode: "purchase" })}
                            >
                              {item.purchase_unit_name} (× {item.purchase_to_issue_factor} {item.unit_of_measure_name})
                            </button>
                          </div>
                        </div>
                      ) : item ? (
                        <p className="col-span-12 -mt-1 text-xs text-slate-400">{item.unit_of_measure_name}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-slate-100 px-6 py-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()}>
              {submitting ? "Posting…" : "Post receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
