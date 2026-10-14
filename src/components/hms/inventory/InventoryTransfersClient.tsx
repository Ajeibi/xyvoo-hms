"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, Plus, Trash2 } from "lucide-react";
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
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type {
  InventoryItemRow,
  InventoryLocationRow,
  InventoryTransferWithLines,
} from "@/lib/hms/inventory-types";

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  pending: "amber",
  in_transit: "blue",
  completed: "green",
  cancelled: "red",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_transit: "In transit",
  completed: "Completed",
  cancelled: "Cancelled",
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const smallButton = "px-3 py-1.5";
const qtyInput = hmsInput.replace("w-full ", "w-24 ");

function TransferStatus({ status }: { status: string }) {
  return <HmsPill tone={STATUS_TONE[status] ?? "slate"}>{STATUS_LABEL[status] ?? status.replace(/_/g, " ")}</HmsPill>;
}

type DraftLine = { itemId: string; qty: string };

function emptyLine(): DraftLine {
  return { itemId: "", qty: "" };
}

export function InventoryTransfersClient({
  slug,
  initialTransfers,
  locations,
  items: initialItems,
  canCreateItem = false,
}: {
  slug: string;
  initialTransfers: InventoryTransferWithLines[];
  locations: InventoryLocationRow[];
  items: InventoryItemRow[];
  canCreateItem?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [viewTarget, setViewTarget] = useState<InventoryTransferWithLines | null>(null);
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function resetForm() {
    setFromLocationId("");
    setToLocationId("");
    setNotes("");
    setLines([emptyLine()]);
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  const validLines = lines.filter((l) => l.itemId && Number(l.qty) > 0);
  const locationsDiffer = Boolean(fromLocationId) && Boolean(toLocationId) && fromLocationId !== toLocationId;
  const canSubmit = locationsDiffer && validLines.length > 0 && !submitting;
  const sameLocation = Boolean(fromLocationId) && Boolean(toLocationId) && !locationsDiffer;

  const filteredTransfers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return initialTransfers;
    return initialTransfers.filter(
      (t) =>
        t.transfer_number.toLowerCase().includes(term) ||
        t.from_location_name.toLowerCase().includes(term) ||
        t.to_location_name.toLowerCase().includes(term) ||
        t.lines.some((l) => l.item_name.toLowerCase().includes(term) || l.item_sku.toLowerCase().includes(term)),
    );
  }, [initialTransfers, search]);

  async function submitTransfer() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/inventory/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          fromLocationId,
          toLocationId,
          notes: notes.trim() || undefined,
          lines: validLines.map((l) => ({ itemId: l.itemId, qty: Number(l.qty) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create transfer", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Transfer created");
      setOpen(false);
      resetForm();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmReceipt(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/inventory/transfers/${id}/receive`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not confirm receipt", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Transfer received");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function cancelPendingTransfer(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hotel/inventory/transfers/${id}/cancel`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not cancel transfer", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Transfer cancelled");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  const newButton = (
    <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      New transfer
    </button>
  );

  return (
    <div className="space-y-6">
      <HmsCard
        id="inventory-transfers-list"
        title="Transfers"
        description="Select a transfer to see its items."
        icon={ArrowLeftRight}
        meaning="stock"
        flush
        actions={newButton}
      >
        {initialTransfers.length > 0 ? (
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <label htmlFor="inventory-transfers-search" className="mb-1 block text-sm font-medium text-slate-800">
              Search transfers
            </label>
            <input
              id="inventory-transfers-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Transfer number, store, item or SKU"
              className={`${hmsInput} sm:max-w-sm`}
            />
          </div>
        ) : null}

        {filteredTransfers.length === 0 ? (
          initialTransfers.length === 0 ? (
            <HmsEmptyState
              bare
              art="box"
              meaning="stock"
              title="No transfers yet"
              description="Move stock from one store to another, for example from the main store to the bar."
              action={newButton}
            />
          ) : (
            <p role="status" className="px-6 py-10 text-center text-sm text-slate-600">
              No transfers match your search.
            </p>
          )
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredTransfers.map((t) => (
              <li
                key={t.id}
                onClick={() => setViewTarget(t)}
                className="cursor-pointer px-5 py-4 text-sm transition-colors hover:bg-slate-50 sm:px-6"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <button
                    type="button"
                    className={`rounded-lg text-left ${focusRing}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewTarget(t);
                    }}
                  >
                    <span className="block font-semibold text-slate-900">{t.transfer_number}</span>
                    <span className="mt-0.5 block text-slate-700">
                      {t.from_location_name} <span aria-hidden>&rarr;</span>
                      <span className="sr-only">to</span> {t.to_location_name}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-600">
                      {t.lines.length} item{t.lines.length === 1 ? "" : "s"}
                    </span>
                  </button>
                  <div className="flex flex-wrap items-center gap-2">
                    <TransferStatus status={t.status} />
                    {t.status === "in_transit" ? (
                      <button
                        type="button"
                        className={`${hmsButton.primary} ${smallButton} ${focusRing}`}
                        disabled={busyId === t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void confirmReceipt(t.id);
                        }}
                      >
                        Confirm receipt
                      </button>
                    ) : null}
                    {t.status === "pending" || t.status === "in_transit" ? (
                      <button
                        type="button"
                        className={`${hmsButton.secondary} ${smallButton} ${focusRing}`}
                        disabled={busyId === t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void cancelPendingTransfer(t.id);
                        }}
                      >
                        Cancel transfer
                      </button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) resetForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New transfer</DialogTitle>
            <DialogDescription>
              Stock leaves the source store straight away. It is added to the destination once receipt is confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <HmsField id="inventory-transfer-from" label="From">
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger
                    id="inventory-transfer-from"
                    className="rounded-xl border-slate-300"
                    aria-invalid={sameLocation || undefined}
                    aria-describedby={sameLocation ? "inventory-transfer-error" : undefined}
                  >
                    <SelectValue placeholder="Source location" />
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
              <HmsField id="inventory-transfer-to" label="To">
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger
                    id="inventory-transfer-to"
                    className="rounded-xl border-slate-300"
                    aria-invalid={sameLocation || undefined}
                    aria-describedby={sameLocation ? "inventory-transfer-error" : undefined}
                  >
                    <SelectValue placeholder="Destination location" />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id} disabled={l.id === fromLocationId}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </HmsField>
            </div>
            {sameLocation ? (
              <p id="inventory-transfer-error" role="alert" className="text-sm text-red-700">
                Source and destination locations must differ.
              </p>
            ) : null}

            <div role="group" aria-labelledby="inventory-transfer-lines" className="space-y-2">
              <h3 id="inventory-transfer-lines" className="text-sm font-medium text-slate-800">Items</h3>
              {lines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <InventoryItemPicker
                    slug={slug}
                    items={items}
                    value={line.itemId}
                    onValueChange={(v) => updateLine(idx, { itemId: v })}
                    canCreateItem={canCreateItem}
                    onItemCreated={(item) => setItems((prev) => [...prev, item])}
                    placeholder="Select item"
                    className="flex-1"
                  />
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Qty"
                    aria-label={`Quantity, line ${idx + 1}`}
                    className={qtyInput}
                    value={line.qty}
                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove line ${idx + 1}`}
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                  >
                    <Trash2 className="h-4 w-4 text-slate-600" aria-hidden />
                  </Button>
                </div>
              ))}
              <button type="button" className={`${hmsButton.secondary} ${smallButton} ${focusRing}`} onClick={addLine}>
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add item
              </button>
            </div>

            <HmsField id="inventory-transfer-notes" label="Notes" optional>
              <input
                id="inventory-transfer-notes"
                className={hmsInput}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </HmsField>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void submitTransfer()} disabled={!canSubmit}>
              Create transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(viewTarget)} onOpenChange={(o) => { if (!o) setViewTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{viewTarget?.transfer_number}</DialogTitle>
            <DialogDescription>
              {viewTarget ? `${viewTarget.from_location_name} → ${viewTarget.to_location_name}` : ""}
            </DialogDescription>
          </DialogHeader>

          {viewTarget ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <TransferStatus status={viewTarget.status} />
                <span>Created {new Date(viewTarget.created_at).toLocaleString()}</span>
              </div>

              {viewTarget.notes ? (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">Note: {viewTarget.notes}</p>
              ) : null}

              <div className="overflow-hidden rounded-xl border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-sm font-medium text-slate-600">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left">Item</th>
                      <th scope="col" className="px-3 py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewTarget.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">{l.item_name}</p>
                          <p className="text-xs text-slate-600">{l.item_sku}</p>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                          {l.qty} {l.unit_of_measure}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                {viewTarget.status === "in_transit" ? (
                  <button
                    type="button"
                    className={`${hmsButton.primary} ${smallButton} ${focusRing}`}
                    disabled={busyId === viewTarget.id}
                    onClick={() => {
                      void confirmReceipt(viewTarget.id);
                      setViewTarget(null);
                    }}
                  >
                    Confirm receipt
                  </button>
                ) : null}
                {viewTarget.status === "pending" || viewTarget.status === "in_transit" ? (
                  <button
                    type="button"
                    className={`${hmsButton.secondary} ${smallButton} ${focusRing}`}
                    disabled={busyId === viewTarget.id}
                    onClick={() => {
                      void cancelPendingTransfer(viewTarget.id);
                      setViewTarget(null);
                    }}
                  >
                    Cancel transfer
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setViewTarget(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
