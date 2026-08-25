"use client";

import { useMemo, useState } from "react";
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
import type {
  InventoryItemRow,
  InventoryLocationRow,
  InventoryTransferWithLines,
} from "@/lib/hms/inventory-types";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  in_transit: "bg-amber-100 text-amber-900",
  completed: "bg-emerald-100 text-emerald-900",
  cancelled: "bg-red-100 text-red-800",
};

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

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by transfer #, store, item, or SKU"
          className="w-full flex-1 sm:max-w-sm"
        />
        <Button type="button" className="rounded-lg" onClick={() => setOpen(true)}>
          New transfer
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filteredTransfers.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">
            {initialTransfers.length === 0 ? "No transfers yet." : "No transfers match your search."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredTransfers.map((t) => (
              <li
                key={t.id}
                onClick={() => setViewTarget(t)}
                className="cursor-pointer px-6 py-4 text-sm transition-colors hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{t.transfer_number}</p>
                    <p className="mt-0.5 text-slate-600">
                      {t.from_location_name} &rarr; {t.to_location_name}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {t.lines.length} item{t.lines.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[t.status] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {t.status.replace(/_/g, " ")}
                    </span>
                    {t.status === "in_transit" ? (
                      <Button
                        type="button"
                        size="sm"
                        className="rounded-lg"
                        disabled={busyId === t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void confirmReceipt(t.id);
                        }}
                      >
                        Confirm receipt
                      </Button>
                    ) : null}
                    {t.status === "pending" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        disabled={busyId === t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void cancelPendingTransfer(t.id);
                        }}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

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
              Stock leaves the source location immediately; destination is credited once receipt is confirmed.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">From</p>
                <Select value={fromLocationId} onValueChange={setFromLocationId}>
                  <SelectTrigger>
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
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">To</p>
                <Select value={toLocationId} onValueChange={setToLocationId}>
                  <SelectTrigger>
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
              </div>
            </div>
            {fromLocationId && toLocationId && !locationsDiffer ? (
              <p className="text-xs text-red-600">Source and destination locations must differ.</p>
            ) : null}

            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600">Items</p>
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
                  <Input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="Qty"
                    className="h-10 w-24"
                    value={line.qty}
                    onChange={(e) => updateLine(idx, { qty: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => removeLine(idx)}
                    disabled={lines.length === 1}
                  >
                    &times;
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addLine}>
                Add item
              </Button>
            </div>

            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Notes</p>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
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
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span
                  className={`rounded-full px-2 py-0.5 font-semibold ${STATUS_STYLES[viewTarget.status] ?? "bg-slate-100 text-slate-700"}`}
                >
                  {viewTarget.status.replace(/_/g, " ")}
                </span>
                <span>Created {new Date(viewTarget.created_at).toLocaleString()}</span>
              </div>

              {viewTarget.notes ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Note: {viewTarget.notes}</p>
              ) : null}

              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewTarget.lines.map((l) => (
                      <tr key={l.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-900">{l.item_name}</p>
                          <p className="text-xs text-slate-400">{l.item_sku}</p>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                          {l.qty} {l.unit_of_measure}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                {viewTarget.status === "in_transit" ? (
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-lg"
                    disabled={busyId === viewTarget.id}
                    onClick={() => {
                      void confirmReceipt(viewTarget.id);
                      setViewTarget(null);
                    }}
                  >
                    Confirm receipt
                  </Button>
                ) : null}
                {viewTarget.status === "pending" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-lg"
                    disabled={busyId === viewTarget.id}
                    onClick={() => {
                      void cancelPendingTransfer(viewTarget.id);
                      setViewTarget(null);
                    }}
                  >
                    Cancel
                  </Button>
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
