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
import type { InventoryLocationRow, InventoryStockCountWithLines } from "@/lib/hms/inventory-types";

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  in_progress: "bg-amber-100 text-amber-900",
  completed: "bg-blue-100 text-blue-900",
  posted: "bg-emerald-100 text-emerald-900",
};

export function InventoryStockCountsClient({
  slug,
  initialCounts,
  locations,
}: {
  slug: string;
  initialCounts: InventoryStockCountWithLines[];
  locations: InventoryLocationRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [locationId, setLocationId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingLineId, setSavingLineId] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);

  async function startCount() {
    if (!locationId || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/inventory/stock-counts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, locationId, notes: notes.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not start count", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Stock count started");
      setOpen(false);
      setLocationId("");
      setNotes("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  function qtyFor(lineId: string, fallback: number | null) {
    return draftQty[lineId] ?? (fallback == null ? "" : String(fallback));
  }

  async function saveLine(countId: string, lineId: string) {
    const raw = draftQty[lineId];
    if (raw === undefined || raw.trim() === "") return;
    const countedQty = Number(raw);
    if (!Number.isFinite(countedQty)) return;
    setSavingLineId(lineId);
    try {
      const res = await fetch(`/api/hotel/inventory/stock-counts/${countId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, lineId, countedQty }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save tally", data.error ?? "Try again.");
        return;
      }
      router.refresh();
    } finally {
      setSavingLineId(null);
    }
  }

  async function completeCount(countId: string) {
    setBusyAction(`complete-${countId}`);
    try {
      const res = await fetch(`/api/hotel/inventory/stock-counts/${countId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not complete count", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Count marked complete");
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function postCount(countId: string) {
    setBusyAction(`post-${countId}`);
    try {
      const res = await fetch(`/api/hotel/inventory/stock-counts/${countId}/post`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not post variance", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Variance posted");
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-end">
        <Button type="button" onClick={() => setOpen(true)}>
          Start count
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {initialCounts.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-500">No stock counts yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {initialCounts.map((c) => {
              const expanded = expandedId === c.id;
              const editable = c.status === "in_progress" || c.status === "draft";
              const canComplete = c.status === "in_progress";
              const canPost = c.status === "in_progress" || c.status === "completed";
              return (
                <li key={c.id} className="px-6 py-4 text-sm">
                  <button
                    type="button"
                    className="flex w-full flex-wrap items-start justify-between gap-3 text-left"
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{c.location_name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {new Date(c.count_date).toLocaleDateString()} &middot; {c.lines.length} line
                        {c.lines.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_STYLES[c.status] ?? "bg-slate-100 text-slate-700"}`}
                    >
                      {c.status.replace(/_/g, " ")}
                    </span>
                  </button>

                  {expanded ? (
                    <div className="mt-4 space-y-3">
                      <div className="overflow-x-auto rounded-lg border border-slate-100">
                        <table className="w-full min-w-[560px] text-left text-xs">
                          <thead className="bg-slate-50 text-slate-500">
                            <tr>
                              <th className="px-3 py-2">Item</th>
                              <th className="px-3 py-2">System qty</th>
                              <th className="px-3 py-2">Counted qty</th>
                              <th className="px-3 py-2">Variance</th>
                              <th className="px-3 py-2" />
                            </tr>
                          </thead>
                          <tbody>
                            {c.lines.map((line) => {
                              const draft = qtyFor(line.id, line.counted_qty);
                              const draftNum = draft.trim() === "" ? null : Number(draft);
                              const variance =
                                draftNum != null && Number.isFinite(draftNum)
                                  ? Math.round((draftNum - line.system_qty) * 1000) / 1000
                                  : line.variance;
                              return (
                                <tr key={line.id} className="border-t border-slate-100">
                                  <td className="px-3 py-2">
                                    <p className="font-medium text-slate-900">{line.item_name}</p>
                                    <p className="text-slate-500">{line.item_sku}</p>
                                  </td>
                                  <td className="px-3 py-2 tabular-nums">
                                    {line.system_qty} {line.unit_of_measure}
                                  </td>
                                  <td className="px-3 py-2">
                                    <Input
                                      type="number"
                                      step="any"
                                      className="h-8 w-24"
                                      disabled={!editable}
                                      value={draft}
                                      onChange={(e) =>
                                        setDraftQty((s) => ({ ...s, [line.id]: e.target.value }))
                                      }
                                      onBlur={() => editable && void saveLine(c.id, line.id)}
                                    />
                                  </td>
                                  <td
                                    className={`px-3 py-2 tabular-nums ${
                                      variance != null && variance !== 0
                                        ? "font-semibold text-amber-700"
                                        : "text-slate-500"
                                    }`}
                                  >
                                    {variance == null ? "—" : variance}
                                  </td>
                                  <td className="px-3 py-2">
                                    {savingLineId === line.id ? (
                                      <span className="text-slate-400">Saving…</span>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex justify-end gap-2">
                        {canComplete ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busyAction === `complete-${c.id}`}
                            onClick={() => void completeCount(c.id)}
                          >
                            Complete counting
                          </Button>
                        ) : null}
                        {canPost ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={busyAction === `post-${c.id}`}
                            onClick={() => void postCount(c.id)}
                          >
                            Post variance
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start stock count</DialogTitle>
            <DialogDescription>
              Snapshots current system balances at the chosen location so you can tally against them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
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
              <p className="mb-1 text-xs font-medium text-slate-600">Notes</p>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void startCount()} disabled={!locationId || submitting}>
              Start count
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
