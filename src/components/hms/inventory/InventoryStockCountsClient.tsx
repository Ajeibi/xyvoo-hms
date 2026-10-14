"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleAlert, ClipboardCheck, Plus } from "lucide-react";
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
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type { InventoryLocationRow, InventoryStockCountWithLines } from "@/lib/hms/inventory-types";

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  draft: "slate",
  in_progress: "amber",
  completed: "blue",
  posted: "green",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_progress: "Counting",
  completed: "Counted, ready to post",
  posted: "Posted",
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
const countInput = hmsInput.replace("w-full ", "w-28 ").replace("py-2.5", "py-1.5").replace("px-4", "px-3");

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

  const startButton = (
    <button type="button" className={`${hmsButton.primary} ${focusRing}`} onClick={() => setOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden />
      Start count
    </button>
  );

  return (
    <div className="space-y-6">
      <HmsCard
        id="inventory-counts-list"
        title="Stock counts"
        description="Open a count to enter what you found on the shelf. Each tally saves when you leave the box."
        icon={ClipboardCheck}
        meaning="stock"
        flush
        actions={startButton}
      >
        {initialCounts.length === 0 ? (
          <HmsEmptyState
            bare
            art="page"
            meaning="stock"
            title="No stock counts yet"
            description="Start a count to check what is really on the shelves against what the system expects."
            action={startButton}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {initialCounts.map((c) => {
              const expanded = expandedId === c.id;
              const editable = c.status === "in_progress" || c.status === "draft";
              const canComplete = c.status === "in_progress";
              const canPost = c.status === "completed";
              const panelId = `inventory-count-${c.id}`;
              return (
                <li key={c.id} className="text-sm">
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    className={`flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50 sm:px-6 ${focusRing}`}
                    onClick={() => setExpandedId(expanded ? null : c.id)}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${expanded ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold text-slate-900">{c.location_name}</span>
                        <span className="mt-0.5 block text-xs text-slate-600">
                          {new Date(c.count_date).toLocaleDateString()} &middot; {c.lines.length} line
                          {c.lines.length === 1 ? "" : "s"}
                        </span>
                      </span>
                    </span>
                    <HmsPill tone={STATUS_TONE[c.status] ?? "slate"}>{STATUS_LABEL[c.status] ?? c.status.replace(/_/g, " ")}</HmsPill>
                  </button>

                  {expanded ? (
                    <div id={panelId} className="space-y-3 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-6">
                      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                        <table className="w-full min-w-[560px] text-left text-sm">
                          <thead className="text-sm font-medium text-slate-600">
                            <tr className="border-b border-slate-100">
                              <th scope="col" className="px-3 py-3">Item</th>
                              <th scope="col" className="px-3 py-3 text-right">System qty</th>
                              <th scope="col" className="px-3 py-3">Counted qty</th>
                              <th scope="col" className="px-3 py-3 text-right">Variance</th>
                              <th scope="col" className="px-3 py-3">
                                <span className="sr-only">Save status</span>
                              </th>
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
                              const hasVariance = variance != null && variance !== 0;
                              return (
                                <tr key={line.id} className="border-t border-slate-100">
                                  <td className="px-3 py-3">
                                    <p className="font-medium text-slate-900">{line.item_name}</p>
                                    <p className="text-xs text-slate-600">{line.item_sku}</p>
                                  </td>
                                  <td className="px-3 py-3 text-right tabular-nums text-slate-700">
                                    {line.system_qty} {line.unit_of_measure}
                                  </td>
                                  <td className="px-3 py-3">
                                    <input
                                      type="number"
                                      step="any"
                                      aria-label={`Counted quantity for ${line.item_name}`}
                                      className={`${countInput} disabled:bg-slate-50 disabled:text-slate-600`}
                                      disabled={!editable}
                                      value={draft}
                                      onChange={(e) =>
                                        setDraftQty((s) => ({ ...s, [line.id]: e.target.value }))
                                      }
                                      onBlur={() => editable && void saveLine(c.id, line.id)}
                                    />
                                  </td>
                                  <td
                                    className={`px-3 py-3 text-right tabular-nums ${
                                      hasVariance ? "font-semibold text-rose-700" : "text-slate-600"
                                    }`}
                                  >
                                    {variance == null ? (
                                      <span aria-label="Not counted yet">—</span>
                                    ) : hasVariance ? (
                                      <span className="inline-flex items-center justify-end gap-1">
                                        <CircleAlert className="h-3.5 w-3.5" aria-hidden />
                                        {variance}
                                        <span className="sr-only"> (difference)</span>
                                      </span>
                                    ) : (
                                      variance
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    {savingLineId === line.id ? (
                                      <span role="status" className="text-slate-600">Saving…</span>
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
                          <button
                            type="button"
                            className={`${hmsButton.secondary} ${focusRing}`}
                            disabled={busyAction === `complete-${c.id}`}
                            onClick={() => void completeCount(c.id)}
                          >
                            Complete counting
                          </button>
                        ) : null}
                        {canPost ? (
                          <button
                            type="button"
                            className={`${hmsButton.primary} ${focusRing}`}
                            disabled={busyAction === `post-${c.id}`}
                            onClick={() => void postCount(c.id)}
                          >
                            Post variance
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </HmsCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start stock count</DialogTitle>
            <DialogDescription>
              Takes a snapshot of the current system balances at the store you choose, so you can count against them.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <HmsField id="inventory-count-location" label="Location">
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="inventory-count-location" className="rounded-xl border-slate-300">
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
            <HmsField id="inventory-count-notes" label="Notes" optional>
              <input id="inventory-count-notes" className={hmsInput} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </HmsField>
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
